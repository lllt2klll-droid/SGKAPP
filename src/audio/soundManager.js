// Central SoundManager — single audio gate for the whole app.
// Components must only call soundManager.play("event") — never new Audio().
// Respects settingsStore (soundEnabled/volume/profile), profile gating, reducedMotion optional.

import { getAssetUrl, effectiveVolume } from "./soundAssets.js";
import { normalizeEvent, isEventEnabledForProfile, VALID_PROFILES } from "./soundEvents.js";
import { loadSettings } from "../settingsStore.js";

const CACHE = new Map(); // event -> HTMLAudioElement (template)
let enabledOverride = null; // for preview bypass if needed
let volumeOverride = null;
let pendingPreload = false;
let lastPlayAt = new Map(); // event -> timestamp for throttle

const THROTTLE_MS = {
  pageTurn: 380,
  click: 80,
};

// ── WebAudio fallback synthesis (ensures audible even if mp3 placeholders are silent or blocked) ──
let _ctx = null;
let _unlockHandlerAdded = false;
const _activeNodes = new Set();
function getCtx() {
  try {
    if (!_ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      _ctx = new AC();
    }
    if (_ctx.state === "suspended") _ctx.resume().catch(() => {});
    // unlock on first gesture if still suspended
    if (_ctx.state === "suspended" && !_unlockHandlerAdded) {
      _unlockHandlerAdded = true;
      const unlock = () => {
        try { _ctx.resume(); } catch {}
        window.removeEventListener("click", unlock);
        window.removeEventListener("keydown", unlock);
        window.removeEventListener("touchstart", unlock);
      };
      window.addEventListener("click", unlock, { once: true });
      window.addEventListener("keydown", unlock, { once: true });
      window.addEventListener("touchstart", unlock, { once: true });
    }
    return _ctx;
  } catch { return null; }
}
const SYNTH_PRESETS = {
  click: [{ f: 900, d: 0.07, t: "sine", g: 0.9 }],
  open: [{ f: 620, d: 0.09, t: "sine", g: 0.9 }, { f: 820, d: 0.09, t: "sine", g: 0.7, delay: 0.06 }],
  close: [{ f: 520, d: 0.09, t: "sine", g: 0.85 }, { f: 380, d: 0.09, t: "sine", g: 0.7, delay: 0.06 }],
  success: [{ f: 880, d: 0.14, t: "sine", g: 0.95 }, { f: 1109, d: 0.16, t: "sine", g: 0.85, delay: 0.08 }],
  error: [{ f: 180, d: 0.22, t: "triangle", g: 0.9 }, { f: 150, d: 0.18, t: "triangle", g: 0.7, delay: 0.12 }],
  warning: [{ f: 220, d: 0.2, t: "triangle", g: 0.85 }],
  notification: [{ f: 720, d: 0.12, t: "sine", g: 0.9 }],
  bookmark: [{ f: 920, d: 0.10, t: "sine", g: 0.95 }],
  pageTurn: [{ f: 480, d: 0.06, t: "sine", g: 0.55 }],
  save: [{ f: 880, d: 0.14, t: "sine", g: 0.9 }, { f: 1046, d: 0.14, t: "sine", g: 0.8, delay: 0.07 }],
  aiComplete: [{ f: 680, d: 0.11, t: "sine", g: 0.9 }, { f: 860, d: 0.11, t: "sine", g: 0.75, delay: 0.07 }],
  missionComplete: [{ f: 523, d: 0.13, t: "sine", g: 0.9 }, { f: 659, d: 0.13, t: "sine", g: 0.9, delay: 0.11 }, { f: 784, d: 0.22, t: "sine", g: 1.0, delay: 0.22 }],
  taskComplete: [{ f: 523, d: 0.13, t: "sine", g: 0.9 }, { f: 659, d: 0.13, t: "sine", g: 0.9, delay: 0.11 }, { f: 784, d: 0.18, t: "sine", g: 0.95, delay: 0.22 }],
  achievementUnlock: [{ f: 523, d: 0.13, t: "sine", g: 0.9 }, { f: 659, d: 0.13, t: "sine", g: 0.9, delay: 0.11 }, { f: 784, d: 0.28, t: "sine", g: 1.0, delay: 0.22 }],
};
function synthPlay(event, effVol) {
  const preset = SYNTH_PRESETS[event];
  if (!preset) return false;
  const ctx = getCtx();
  if (!ctx) return false;
  const now = ctx.currentTime;
  let ok = false;
  for (const tone of preset) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.t || "sine";
      osc.frequency.value = tone.f;
      const start = now + (tone.delay || 0);
      const dur = tone.d || 0.12;
      const peak = Math.max(0.0001, effVol * (tone.g ?? 1) * 0.9);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
      _activeNodes.add(osc);
      osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch {} _activeNodes.delete(osc); };
      ok = true;
    } catch {}
  }
  return ok;
}

function getSettingsSnapshot() {
  try {
    const s = loadSettings();
    const b = s?.behavior || {};
    return {
      soundEnabled: b.soundEnabled === true,
      soundVolume: Number.isFinite(b.soundVolume) ? b.soundVolume : 0.35,
      soundProfile: VALID_PROFILES.has(b.soundProfile) ? b.soundProfile : "minimal",
      reduceMotion: s?.accessibility?.reduceMotion === true,
    };
  } catch {
    return { soundEnabled: false, soundVolume: 0.35, soundProfile: "minimal", reduceMotion: false };
  }
}

function canPlay(event) {
  const normalized = normalizeEvent(event);
  if (!normalized) return false;
  const url = getAssetUrl(normalized);
  if (!url) return false;
  const cfg = getSettingsSnapshot();
  const enabled = enabledOverride !== null ? enabledOverride : cfg.soundEnabled;
  if (!enabled) return false;
  if (!isEventEnabledForProfile(normalized, cfg.soundProfile)) return false;
  // Respect reduced motion for decorative sounds
  if (cfg.reduceMotion && (normalized === "pageTurn" || normalized === "click")) return false;
  // Throttle
  const thr = THROTTLE_MS[normalized];
  if (thr) {
    const last = lastPlayAt.get(normalized) || 0;
    if (Date.now() - last < thr) return false;
  }
  return true;
}

function getOrCreateAudio(event) {
  const normalized = normalizeEvent(event);
  const url = getAssetUrl(normalized);
  if (!url) return null;
  if (CACHE.has(normalized)) return CACHE.get(normalized);
  try {
    const a = new Audio(url);
    a.preload = "auto";
    // Do not autoplay; just cache
    CACHE.set(normalized, a);
    return a;
  } catch {
    return null;
  }
}

function playInternal(event, { force = false } = {}) {
  const normalized = normalizeEvent(event);
  if (!normalized) return false;
  const url = getAssetUrl(normalized);
  // allow synth even if no asset entry (e.g. warning alias)
  if (!force && !canPlay(normalized)) return false;
  // for preview, bypass canPlay but still check profile/throttle minimally
  if (force) {
    // preview: still respect throttle for pageTurn spam
    const thr = THROTTLE_MS[normalized];
    if (thr) {
      const last = lastPlayAt.get(normalized) || 0;
      if (Date.now() - last < thr) return false;
    }
  }

  const cfg = getSettingsSnapshot();
  const vol = volumeOverride !== null ? volumeOverride : cfg.soundVolume;
  const eff = effectiveVolume(normalized, vol);
  if (eff <= 0.001) return false;

  if (THROTTLE_MS[normalized]) lastPlayAt.set(normalized, Date.now());

  // 1) Try WebAudio synthesis (always audible, no file dependency)
  let synthOk = false;
  try { synthOk = synthPlay(normalized, eff); } catch {}

  // 2) Also try HTMLAudio file for richer design later (parallel, not blocking)
  if (url) {
    try {
      let template = CACHE.get(normalized);
      if (!template) template = getOrCreateAudio(normalized);
      if (template) {
        let audio;
        try { audio = template.cloneNode(); } catch { audio = template; }
        audio.volume = eff * 0.85; // slightly duck file when synth also plays to avoid doubling loudness
        try { audio.currentTime = 0; } catch {}
        const p = audio.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
        // if synth succeeded, file is enhancement; if synth failed, file is primary
        return synthOk || true;
      }
    } catch {}
  }
  return synthOk;
}

export const soundManager = {
  play(event) {
    return playInternal(event, { force: false });
  },
  // Preview ignores enabled gate but still respects volume/profile for realism
  preview(event) {
    const normalized = normalizeEvent(event);
    if (!normalized) return false;
    if (!getAssetUrl(normalized)) return false;
    // preview should work even when sound disabled — use force but keep volume scaling
    return playInternal(normalized, { force: true });
  },
  setEnabled(v) {
    enabledOverride = !!v;
  },
  clearEnabledOverride() {
    enabledOverride = null;
  },
  setVolume(v) {
    const n = Number(v);
    volumeOverride = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
  },
  clearVolumeOverride() {
    volumeOverride = null;
  },
  stopAll() {
    for (const a of CACHE.values()) {
      try { a.pause(); a.currentTime = 0; } catch {}
    }
    for (const n of [..._activeNodes]) {
      try { n.stop(); n.disconnect(); } catch {}
    }
    _activeNodes.clear();
    try { if (_ctx) { /* keep ctx alive */ } } catch {}
  },
  preload(events) {
    const list = Array.isArray(events) ? events : Object.keys(getAssetUrl ? {} : {});
    // Preload all known if no list
    const toPreload = list.length ? list : ["success","error","notification","bookmark","open","close","aiComplete","missionComplete","pageTurn","click"];
    for (const e of toPreload) {
      getOrCreateAudio(e);
    }
  },
  isEnabled() {
    return getSettingsSnapshot().soundEnabled;
  },
  getVolume() {
    return getSettingsSnapshot().soundVolume;
  },
  getProfile() {
    return getSettingsSnapshot().soundProfile;
  },
};

// ── Global click sound — "tương tác nào cũng có tiếng trừ zoom" ──
let _globalClickInit = false;
function isZoomExcluded(el) {
  if (!el) return false;
  try {
    if (el.closest && el.closest("[data-no-sound]")) return true;
    if (el.closest && el.closest("[data-zoom]")) return true;
    const label = ((el.getAttribute && (el.getAttribute("aria-label") || el.getAttribute("title") || "")) || "").toLowerCase();
    if (label.includes("zoom") || label.includes("phóng") || label.includes("thu phóng")) return true;
    const cls = typeof el.className === "string" ? el.className.toLowerCase() : "";
    if (cls.includes("zoom")) return true;
    // range/slider that controls zoom — exclude by parent data-zoom
    if (el.tagName === "INPUT" && el.type === "range" && el.closest && el.closest("[data-zoom]")) return true;
  } catch {}
  return false;
}
export function initGlobalClickSound() {
  if (_globalClickInit) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  _globalClickInit = true;
  const handler = (e) => {
    try {
      // Ignore right-click / modifier
      if (e.button !== 0) return;
      // Don't double-trigger if already handled via explicit soundManager.play in same tick (throttle covers)
      const target = e.target;
      if (!target || !target.closest) return;
      // Exclude zoom controls
      if (isZoomExcluded(target) || isZoomExcluded(target.closest && target.closest("button, [role='button'], input, [data-zoom]"))) return;
      // Exclude if inside zoom container
      const zoomAncestor = target.closest ? target.closest("[data-zoom]") : null;
      if (zoomAncestor) return;
      // Play generic click for any user interaction (per user request: every interaction)
      // Throttling is handled inside canPlay
      soundManager.play("click");
    } catch {}
  };
  // capture to catch before stopPropagation
  document.addEventListener("click", handler, true);
  // Also for keyboard activation (Enter/Space on buttons)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const t = document.activeElement;
    if (!t) return;
    if (isZoomExcluded(t)) return;
    const tag = t.tagName;
    if (tag === "BUTTON" || tag === "A" || t.getAttribute("role") === "button") {
      soundManager.play("click");
    }
  }, true);
}

// Auto-subscribe to settings updates for real-time sync (no reload needed)
if (typeof window !== "undefined") {
  try {
    window.addEventListener("sgk:settings-updated", () => {
      // Clear overrides so store is source of truth
      enabledOverride = null;
      volumeOverride = null;
      // Lazily preload after user enabled sound (after interaction)
      const cfg = getSettingsSnapshot();
      if (cfg.soundEnabled && !pendingPreload) {
        pendingPreload = true;
        setTimeout(() => {
          try { soundManager.preload(); } catch {}
          pendingPreload = false;
        }, 800);
      }
    });
  } catch {}
}

export default soundManager;
