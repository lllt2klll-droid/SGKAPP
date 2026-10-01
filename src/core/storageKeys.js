// ── Storage Keys Inventory — Single Source of Truth ─────────────────
// Every localStorage key / prefix defined once. Other modules MUST import
// from here instead of hard-coding strings. Backward compat kept by
// re-exporting same values that storage.js previously defined.
//
// Domain grouping mirrors spec: Settings | User Data | Teaching | Research | AI | Whiteboard | Scan | Cache | Book Data

export const STORAGE_KEYS = {
  // User / reading
  BOOKMARKS: "sgk_bookmarks",
  BOOKMARK_LABELS: "sgk_bookmark_labels",
  VOCAB: "sgk_vocab",
  QUIZ_HISTORY: "sgk_quiz_history",
  MARKS_PREFIX: "sgk_marks_",
  TEACHER_NOTES_PREFIX: "sgk_teacherNotes_",
  NOTES_PREFIX: "notes_",
  STUDYNOTES_PREFIX: "studynotes_",
  CMPNOTE_PREFIX: "sgk_cmpnote_",
  // Per-book reading progress
  LAST_PAGE_PREFIX: "lastPage_",
  LAST_TOTAL_PREFIX: "lastTotal_",
  // Favorites/history
  FAVS: "sgk_favs",
  HISTORY: "sgk_history",
  COUNTS: "sgk_counts",
  VIEW_MODE: "sgk_view_mode",
  SORT_BY: "sgk_sort_by",
  // Research
  REFS: "sgk_refs",
  CONCEPTS: "sgk_concepts",
  COLLECTIONS: "sgk_collections",
  CLIPS: "sgk_clips",
  EVIDENCE: "sgk_evidence",
  RELATED_LINKS: "sgk_related_links",
  // Personal
  IDEAS: "sgk_ideas",
  TASKS: "sgk_tasks",
  INTERNSHIP: "sgk_internship",
  // Teaching
  LESSON_PLANS: "sgk_lessonplans",
  LESSON_PLANS_LEGACY: "sgk_lessonPlans",
  LESSON_PLANS_FAV: "sgk_lessonplans_fav",
  KHBD_V2_PLANS: "khbd_v2_plans",
  ACTIVITIES: "sgk_activities",
  WORKSHEETS: "sgk_worksheets",
  QUESTIONS: "sgk_questions",
  AUTOSAVE_PREFIX: "sgk_autosave_",
  ACTIVITY_RATINGS: "sgk_activity_ratings",
  // Scans
  SCANS: "sgk_scans_v1",
  // UI
  SIDEBAR_COLLAPSED: "sgk_sidebar_collapsed",
  SIDEBAR_W: "sgk_sidebar_w",
  EXPANDED_SECTIONS: "sgk_expanded_sections",
  TOC_W: "sgk_toc_w",
  AI_W: "sgk_ai_w",
  CONTINUE_COLLAPSED: "sgk_continue_collapsed",
  WORKFLOW_COLLAPSED: "sgk_workflow_collapsed",
  LAST_BACKUP: "sgk_last_backup",
  CUSTOM_TITLES: "sgk_custom_titles",
  // Missions
  MISSIONS: "sgk_missions",
  MISSION_STREAK: "sgk_mission_streak",
  MISSION_XP: "sgk_mission_xp",
  ACHIEVEMENTS: "sgk_achievements",
  MISSION_PROCESSED: "sgk_mission_processed",
  MISSION_WEEKLY: "sgk_mission_weekly",
  MISSION_MONTHLY: "sgk_mission_monthly",
  MISSION_HISTORY: "sgk_mission_history",
  MISSION_ADAPTIVE: "sgk_adaptive_difficulty_state",
  MISSION_SCHEMA: "sgk_mission_schema_version",
  // AI
  AI_HISTORY: "ai_analysis_history",
  AI_IMAGE_CACHE: "ai_image_cache",
  AI_PROMPTS: "ai_prompt_templates",
  AI_RESULTS: "ai_analysis_results",
  AI_PREFS: "ai_model_preferences",
  AI_STATS: "ai_usage_stats",
  // Settings / keys
  SETTINGS: "sgk_settings",
  GEMINI_KEY: "GEMINI_API_KEY",
  THEME: "sgk_theme",
  // Whiteboard
  WB_INDEX: "sgk_wb_index",
  WB_BOARD_PREFIX: "sgk_wb_board_",
  WB_PENDING: "sgk_wb_pending",
  // Catalog
  SUBJECT_CATALOG: "sgk_subject_catalog_v1",
  // Thùng rác 30 ngày (A2)
  TRASH: "sgk_trash",
  // TOC custom
  TOC_CUSTOM: "sgk_toc_custom_v1",
  TOC_FILE_PREFIX: "toc_",
  TOC_FILE_MARKER: "__file__",
  // Web toolbox
  WEB_TOOLS: "sgk_web_tools",
  // Recent searches
  RECENT_SEARCHES: "sgk_recent_searches",
  // Sync
  SYNC_STATUS_PREFIX: "sync_status_",
  SYNC_META_PREFIX: "sync_metadata_",
  SYNC_HISTORY_PREFIX: "sync_history_",
  // Migration version — v3 includes whiteboard boards IDB migration (v2 was hybrid clips/refs)
  STORAGE_MIGRATION_VERSION: "sgk_storage_migration_v3",
  // Cache / rebuildable prefixes — lastPage/lastTotal là USER DATA, KHÔNG phải cache (TASK #9)
  CACHE_PREFIXES: [
    "sgk_index_",
    "sgk_meta_",
    "sgk_idx_",
    "sgk_idxmeta_",
    "ocr_",
    "txt_",
    "chat_",
    "assistant_history",
    "sgk_textbook_draft",
    "toc_",
  ],
};

// Central BACKUP inventory — mirrors storage.BACKUP_KEYS but sourced from STORAGE_KEYS
export const BACKUP_KEYS = [
  STORAGE_KEYS.BOOKMARKS,
  STORAGE_KEYS.BOOKMARK_LABELS,
  STORAGE_KEYS.VOCAB,
  STORAGE_KEYS.QUIZ_HISTORY,
  STORAGE_KEYS.THEME,
  STORAGE_KEYS.FAVS,
  STORAGE_KEYS.HISTORY,
  STORAGE_KEYS.COUNTS,
  STORAGE_KEYS.VIEW_MODE,
  STORAGE_KEYS.SORT_BY,
  "glossary_history",
  STORAGE_KEYS.STUDYNOTES_PREFIX,
  STORAGE_KEYS.NOTES_PREFIX,
  STORAGE_KEYS.REFS,
  STORAGE_KEYS.CONCEPTS,
  STORAGE_KEYS.COLLECTIONS,
  STORAGE_KEYS.CLIPS,
  STORAGE_KEYS.MARKS_PREFIX,
  STORAGE_KEYS.TEACHER_NOTES_PREFIX,
  STORAGE_KEYS.CMPNOTE_PREFIX,
  STORAGE_KEYS.EVIDENCE,
  STORAGE_KEYS.RELATED_LINKS,
  STORAGE_KEYS.IDEAS,
  STORAGE_KEYS.TASKS,
  STORAGE_KEYS.INTERNSHIP,
  STORAGE_KEYS.LESSON_PLANS,
  STORAGE_KEYS.LESSON_PLANS_LEGACY,
  STORAGE_KEYS.LESSON_PLANS_FAV,
  STORAGE_KEYS.KHBD_V2_PLANS,
  STORAGE_KEYS.ACTIVITIES,
  STORAGE_KEYS.WORKSHEETS,
  STORAGE_KEYS.QUESTIONS,
  STORAGE_KEYS.SCANS,
  STORAGE_KEYS.AUTOSAVE_PREFIX,
  STORAGE_KEYS.CUSTOM_TITLES,
  STORAGE_KEYS.ACTIVITY_RATINGS,
  STORAGE_KEYS.CONTINUE_COLLAPSED,
  STORAGE_KEYS.WORKFLOW_COLLAPSED,
  STORAGE_KEYS.LAST_BACKUP,
  STORAGE_KEYS.SIDEBAR_COLLAPSED,
  STORAGE_KEYS.EXPANDED_SECTIONS,
  STORAGE_KEYS.MISSIONS,
  STORAGE_KEYS.MISSION_STREAK,
  STORAGE_KEYS.MISSION_XP,
  STORAGE_KEYS.ACHIEVEMENTS,
  STORAGE_KEYS.MISSION_PROCESSED,
  STORAGE_KEYS.MISSION_MONTHLY,
  STORAGE_KEYS.MISSION_WEEKLY,
  STORAGE_KEYS.MISSION_HISTORY,
  STORAGE_KEYS.MISSION_ADAPTIVE,
  STORAGE_KEYS.MISSION_SCHEMA,
  STORAGE_KEYS.AI_HISTORY,
  STORAGE_KEYS.AI_IMAGE_CACHE,
  STORAGE_KEYS.AI_PROMPTS,
  STORAGE_KEYS.AI_RESULTS,
  STORAGE_KEYS.AI_PREFS,
  STORAGE_KEYS.AI_STATS,
  STORAGE_KEYS.SETTINGS,
  STORAGE_KEYS.GEMINI_KEY,
  STORAGE_KEYS.WB_INDEX,
  STORAGE_KEYS.WB_BOARD_PREFIX,
  STORAGE_KEYS.WB_PENDING,
  STORAGE_KEYS.SUBJECT_CATALOG,
  STORAGE_KEYS.TOC_CUSTOM,
  STORAGE_KEYS.TRASH,
  STORAGE_KEYS.WEB_TOOLS,
  STORAGE_KEYS.LAST_PAGE_PREFIX,
  STORAGE_KEYS.LAST_TOTAL_PREFIX,
  STORAGE_KEYS.SYNC_STATUS_PREFIX,
  STORAGE_KEYS.SYNC_META_PREFIX,
  STORAGE_KEYS.SYNC_HISTORY_PREFIX,
];

export function isBackupKey(key) {
  return BACKUP_KEYS.some((p) => key === p || key.startsWith(p));
}
export function isCacheKey(key) {
  return STORAGE_KEYS.CACHE_PREFIXES.some((p) => key.startsWith(p));
}

export function lastPageKey(filename) { return `${STORAGE_KEYS.LAST_PAGE_PREFIX}${filename}`; }
export function lastTotalKey(filename) { return `${STORAGE_KEYS.LAST_TOTAL_PREFIX}${filename}`; }
export function wbBoardKey(id) { return `${STORAGE_KEYS.WB_BOARD_PREFIX}${id}`; }
export function marksKey(filename) { return `${STORAGE_KEYS.MARKS_PREFIX}${filename}`; }
export function teacherNotesKey(filename) { return `${STORAGE_KEYS.TEACHER_NOTES_PREFIX}${filename}`; }
export function idxKey(filename) { return `sgk_idx_${filename}`; }
export function idxMetaKey(filename) { return `sgk_idxmeta_${filename}`; }
export function ocrKey(filename, page) { return `ocr_${filename}_${page}`; }
