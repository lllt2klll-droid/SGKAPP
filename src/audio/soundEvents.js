// Semantic sound events + profiles — no component hard-codes logic here-only.

export const SOUND_EVENTS = {
  UI_CLICK: "click",
  UI_OPEN: "open",
  UI_CLOSE: "close",
  SUCCESS: "success",
  ERROR: "error",
  WARNING: "warning",
  NOTIFICATION: "notification",
  BOOKMARK_ADD: "bookmark",
  BOOKMARK_REMOVE: "bookmark",
  BOOKMARK: "bookmark",
  PAGE_TURN: "pageTurn",
  SAVE: "save",
  AI_COMPLETE: "aiComplete",
  TASK_COMPLETE: "taskComplete",
  MISSION_COMPLETE: "missionComplete",
  ACHIEVEMENT_UNLOCK: "achievementUnlock",
};

// Enable map per profile — which semantic events are audible
export const SOUND_PROFILES = {
  minimal: {
    click: true,
    open: true,
    close: true,
    success: true,
    error: true,
    warning: true,
    notification: true,
    bookmark: true,
    pageTurn: true,
    save: true,
    aiComplete: true,
    missionComplete: true,
    taskComplete: true,
    achievementUnlock: true,
  },
  standard: {
    click: true,
    open: true,
    close: true,
    success: true,
    error: true,
    warning: true,
    notification: true,
    bookmark: true,
    pageTurn: true,
    save: true,
    aiComplete: true,
    missionComplete: true,
    taskComplete: true,
    achievementUnlock: true,
  },
};

export const VALID_PROFILES = new Set(Object.keys(SOUND_PROFILES));

export function isEventEnabledForProfile(event, profile) {
  const p = SOUND_PROFILES[profile] || SOUND_PROFILES.minimal;
  // normalize aliases
  if (event === "page-turn") event = "pageTurn";
  if (event === "ai-complete") event = "aiComplete";
  if (event === "mission-complete") event = "missionComplete";
  return p[event] !== false;
}

// Normalize aliases to canonical keys used in SOUND_ASSETS
export function normalizeEvent(event) {
  if (!event) return null;
  const m = {
    "page-turn": "pageTurn",
    "page_turn": "pageTurn",
    "ai-complete": "aiComplete",
    "mission-complete": "missionComplete",
    "task-complete": "taskComplete",
    "achievement-unlock": "achievementUnlock",
    "bookmark_add": "bookmark",
    "bookmark_remove": "bookmark",
  };
  return m[event] || event;
}
