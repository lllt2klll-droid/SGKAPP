// Sound assets — single source for file mapping + effective volume
// Replace files in public/audio/ui/* without touching components.

export const SOUND_ASSETS = {
  click: "/audio/ui/click.wav",
  open: "/audio/ui/open.wav",
  close: "/audio/ui/close.wav",
  success: "/audio/ui/success.wav",
  error: "/audio/ui/error.wav",
  notification: "/audio/ui/notification.wav",
  bookmark: "/audio/ui/bookmark.wav",
  "page-turn": "/audio/ui/page-turn.wav",
  "pageTurn": "/audio/ui/page-turn.wav",
  save: "/audio/ui/save.wav",
  "ai-complete": "/audio/ui/ai-complete.wav",
  aiComplete: "/audio/ui/ai-complete.wav",
  "mission-complete": "/audio/ui/mission-complete.wav",
  missionComplete: "/audio/ui/mission-complete.wav",
};

// Base volumes before user volume scaling (very subtle for teacher app)
export const SOUND_BASE_VOLUME = {
  click: 0.12,
  open: 0.14,
  close: 0.14,
  success: 0.25,
  error: 0.22,
  warning: 0.22,
  notification: 0.20,
  bookmark: 0.20,
  pageTurn: 0.10,
  "page-turn": 0.10,
  save: 0.25,
  aiComplete: 0.18,
  "ai-complete": 0.18,
  missionComplete: 0.28,
  "mission-complete": 0.28,
  taskComplete: 0.26,
  achievementUnlock: 0.28,
};

export function getAssetUrl(event) {
  return SOUND_ASSETS[event] || null;
}

export function getBaseVolume(event) {
  return SOUND_BASE_VOLUME[event] ?? 0.18;
}

export function effectiveVolume(event, userVolume) {
  const base = getBaseVolume(event);
  const uv = Number.isFinite(userVolume) ? Math.max(0, Math.min(1, userVolume)) : 0.35;
  return Math.max(0, Math.min(1, base * uv));
}
