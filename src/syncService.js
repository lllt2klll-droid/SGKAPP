// ── Manual Data Synchronization Service ─────────────────────────────────
// PHASE 6: This is currently LOCAL_SIMULATION — no remote backend.
// Do NOT present as real cloud sync. Reports success locally.
import { safeGetJSON, safeSetJSON, safeRemove, listKeys } from "./safeStorage.js";
import { STORAGE_KEYS } from "./core/storageKeys.js";
import { appEvents, AppEvents } from "./core/appEvents.js";
import { importLegacyPlan } from "./khbd/planModel.js";

// Giáo án: kho mới khbd_v2_* là chính, kho cũ sgk_lessonplans chỉ đọc gộp (legacy)
function collectLessonPlans() {
  const seen = new Map();
  try {
    const legacy = safeGetJSON(STORAGE_KEYS.LESSON_PLANS, [], Array.isArray) || [];
    for (const p of legacy) if (p && p.id && !seen.has(p.id)) seen.set(p.id, p);
  } catch {}
  try {
    const fresh = safeGetJSON(STORAGE_KEYS.KHBD_V2_PLANS, [], Array.isArray) || [];
    for (const p of fresh) if (p && p.id) seen.set(p.id, p); // kho mới thắng khi trùng id
  } catch {}
  return [...seen.values()];
}
function writeLessonPlans(arr) {
  const norm = (Array.isArray(arr) ? arr : []).filter((p) => p && p.id).map((p) => {
    try { return importLegacyPlan(p); } catch { return null; }
  }).filter(Boolean);
  return safeSetJSON(STORAGE_KEYS.KHBD_V2_PLANS, norm);
}

export const SYNC_MODE = "LOCAL_SIMULATION";

/**
 * Sync data types available for synchronization
 */
const SYNC_TYPES = {
  QUESTIONS: "questions",
  LESSON_PLANS: "lessonPlans",
  ACTIVITIES: "activities",
  WORKSHEETS: "worksheets",
  VOCABULARY: "vocabulary",
  BOOKMARKS: "bookmarks",
  CLIPS: "clips",
  REFS: "refs",
  CONCEPTS: "concepts",
  ALL: "all",
};

/**
 * Sync status types
 */
const SYNC_STATUS = {
  IDLE: "idle",
  SYNCING: "syncing",
  SUCCESS: "success",
  ERROR: "error",
  PARTIAL: "partial",
  CONFLICT: "conflict",
};

/**
 * Get current sync status for a specific data type
 * @param {string} syncType - Type of data to check
 * @returns {Object} Sync status information
 */
function getSyncStatus(syncType = SYNC_TYPES.ALL) {
  try {
    const statusKey = `${STORAGE_KEYS.SYNC_STATUS_PREFIX}${syncType}`;
    const data = safeGetJSON(statusKey, null);
    if (data && typeof data === "object") return data;
    return {
      status: SYNC_STATUS.IDLE,
      lastSync: null,
      errorMessage: null,
    };
  } catch (error) {
    console.error("Error getting sync status:", error);
    return {
      status: SYNC_STATUS.ERROR,
      lastSync: null,
      errorMessage: "Không thể đọc trạng thái đồng bộ",
    };
  }
}

/**
 * Update sync status for a specific data type
 * @param {string} syncType - Type of data being synced
 * @param {Object} statusInfo - Status information to store
 */
function updateSyncStatus(syncType, statusInfo) {
  try {
    const statusKey = `${STORAGE_KEYS.SYNC_STATUS_PREFIX}${syncType}`;
    const currentStatus = {
      ...getSyncStatus(syncType),
      ...statusInfo,
      lastUpdated: Date.now(),
    };
    const r = safeSetJSON(statusKey, currentStatus);
    if (!r.ok) console.warn("[syncService] save status failed", statusKey, r.error);

    // Dispatch event for UI updates
    appEvents.emit(AppEvents.SYNC_STATUS_UPDATED, { syncType, status: currentStatus });
  } catch (error) {
    console.error("Error updating sync status:", error);
  }
}

/**
 * Collect data from localStorage for a specific type
 * @param {string} syncType - Type of data to collect
 * @returns {Array} Collected data
 */
function collectData(syncType) {
  try {
    switch (syncType) {
      case SYNC_TYPES.QUESTIONS:
        return safeGetJSON(STORAGE_KEYS.QUESTIONS, [], Array.isArray);

      case SYNC_TYPES.LESSON_PLANS:
        return collectLessonPlans();

      case SYNC_TYPES.ACTIVITIES:
        return safeGetJSON(STORAGE_KEYS.ACTIVITIES, [], Array.isArray);

      case SYNC_TYPES.WORKSHEETS:
        return safeGetJSON(STORAGE_KEYS.WORKSHEETS, [], Array.isArray);

      case SYNC_TYPES.VOCABULARY:
        return safeGetJSON(STORAGE_KEYS.VOCAB, [], Array.isArray);

      case SYNC_TYPES.BOOKMARKS:
        // PHASE 6 FIX: actual bookmark store is sgk_bookmarks (notes_ is per-page notes, not bookmarks)
        try {
          return safeGetJSON(STORAGE_KEYS.BOOKMARKS, {}, (v) => v && typeof v === "object" && !Array.isArray(v));
        } catch (e) {
          console.warn("[storage] verify failed sgk_bookmarks", e);
        }
        return {};

      case SYNC_TYPES.CLIPS:
        return safeGetJSON(STORAGE_KEYS.CLIPS, [], Array.isArray);

      case SYNC_TYPES.REFS:
        return safeGetJSON(STORAGE_KEYS.REFS, [], Array.isArray);

      case SYNC_TYPES.CONCEPTS:
        return safeGetJSON(STORAGE_KEYS.CONCEPTS, [], Array.isArray);

      case SYNC_TYPES.ALL:
        return {
          questions: collectData(SYNC_TYPES.QUESTIONS),
          lessonPlans: collectData(SYNC_TYPES.LESSON_PLANS),
          activities: collectData(SYNC_TYPES.ACTIVITIES),
          worksheets: collectData(SYNC_TYPES.WORKSHEETS),
          vocabulary: collectData(SYNC_TYPES.VOCABULARY),
          bookmarks: collectData(SYNC_TYPES.BOOKMARKS),
          clips: collectData(SYNC_TYPES.CLIPS),
          refs: collectData(SYNC_TYPES.REFS),
          concepts: collectData(SYNC_TYPES.CONCEPTS),
        };

      default:
        return [];
    }
  } catch (error) {
    console.error(`Error collecting data for ${syncType}:`, error);
    return [];
  }
}

/**
 * Validate data integrity before sync
 * @param {string} syncType - Type of data to validate
 * @param {Array} data - Data to validate
 * @returns {Object} Validation result
 */
function validateData(syncType, data) {
  const issues = [];

  try {
    if (!Array.isArray(data)) {
      issues.push("Dữ liệu không phải là mảng");
      return { valid: false, issues };
    }

    // Type-specific validation
    switch (syncType) {
      case SYNC_TYPES.QUESTIONS:
        data.forEach((q, idx) => {
          if (!q.question)
            issues.push(`Câu hỏi ${idx + 1}: Thiếu nội dung câu hỏi`);
          if (!q.type) issues.push(`Câu hỏi ${idx + 1}: Thiếu loại câu hỏi`);
        });
        break;

      case SYNC_TYPES.LESSON_PLANS:
        data.forEach((p, idx) => {
          if (!p.id) issues.push(`Giáo án ${idx + 1}: Thiếu ID`);
          if (!p.title) issues.push(`Giáo án ${idx + 1}: Thiếu tiêu đề`);
        });
        break;

      case SYNC_TYPES.ACTIVITIES:
        data.forEach((a, idx) => {
          if (!a.id) issues.push(`Hoạt động ${idx + 1}: Thiếu ID`);
          if (!a.name) issues.push(`Hoạt động ${idx + 1}: Thiếu tên`);
        });
        break;

      case SYNC_TYPES.WORKSHEETS:
        data.forEach((w, idx) => {
          if (!w.id) issues.push(`Phiếu ${idx + 1}: Thiếu ID`);
          if (!w.title) issues.push(`Phiếu ${idx + 1}: Thiếu tiêu đề`);
        });
        break;

      case SYNC_TYPES.VOCABULARY:
        data.forEach((v, idx) => {
          if (!v.id && !v.word) issues.push(`Từ vựng ${idx + 1}: Thiếu ID/từ`);
          if (!v.word) issues.push(`Từ vựng ${idx + 1}: Thiếu từ`);
        });
        break;

      case SYNC_TYPES.BOOKMARKS:
        // bookmarks là object {file: pages[]} — validate nhẹ từng file
        if (data && typeof data === "object" && !Array.isArray(data)) {
          for (const [f, pages] of Object.entries(data)) {
            if (!Array.isArray(pages)) issues.push(`Đánh dấu "${f}": danh sách trang không phải mảng`);
          }
          return { valid: issues.length === 0, issues };
        }
        break;

      case SYNC_TYPES.CLIPS:
      case SYNC_TYPES.REFS:
      case SYNC_TYPES.CONCEPTS:
        data.forEach((c, idx) => {
          if (!c.id) issues.push(`${syncType} ${idx + 1}: Thiếu ID`);
        });
        break;
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  } catch (error) {
    console.error("Error validating data:", error);
    return {
      valid: false,
      issues: ["Lỗi khi xác thực dữ liệu"],
    };
  }
}

/**
 * Perform manual synchronization for a specific data type
 * @param {string} syncType - Type of data to sync
 * @param {Object} options - Sync options
 * @returns {Promise<Object>} Sync result
 */
async function performSync(syncType = SYNC_TYPES.ALL, options = {}) {
  const { validate = true, backup = true } = options;

  try {
    updateSyncStatus(syncType, {
      status: SYNC_STATUS.SYNCING,
      startTime: Date.now(),
    });

    // Collect data
    const data = collectData(syncType);

    // Validate if requested
    if (validate && syncType !== SYNC_TYPES.ALL) {
      const validation = validateData(syncType, data);
      if (!validation.valid) {
        updateSyncStatus(syncType, {
          status: SYNC_STATUS.ERROR,
          errorMessage: `Xác thực thất bại: ${validation.issues.join(", ")}`,
        });
        return {
          success: false,
          error: validation.issues.join(", "),
          validation,
        };
      }
    }

    // Create backup if requested
    if (backup) {
      const backupKey = `backup_${syncType}_${Date.now()}`;
      const br = safeSetJSON(backupKey, data);
      if (!br.ok) console.warn("[syncService] backup save failed", backupKey, br.error);

      // Clean old backups (keep last 5) — dùng listKeys tập trung
      try {
        const allKeys = listKeys();
        const backupKeys = allKeys
          .filter((k) => k.startsWith(`backup_${syncType}_`))
          .sort()
          .reverse()
          .slice(5);

        backupKeys.forEach((key) => { const r = safeRemove(key); if (!r.ok) console.warn("[syncService] remove backup failed", key, r.error); });
      } catch (e) { console.warn("[syncService] cleanup backups failed", e); }
    }

    // PHASE 6: LOCAL_SIMULATION — no remote backend, simulate local validation only
    // Do NOT fake successful network sync; record mode explicitly
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Store sync metadata
    const syncMetadata = {
      timestamp: Date.now(),
      dataCount: Array.isArray(data) ? data.length : Object.keys(data).length,
      syncType,
      status: "completed",
      mode: SYNC_MODE,
    };

    {
      const mk = `${STORAGE_KEYS.SYNC_META_PREFIX}${syncType}`;
      const r = safeSetJSON(mk, syncMetadata);
      if (!r.ok) console.warn("[syncService] save metadata failed", mk, r.error);
    }

    updateSyncStatus(syncType, {
      status: SYNC_STATUS.SUCCESS,
      lastSync: Date.now(),
      errorMessage: null,
      metadata: syncMetadata,
    });

    return {
      success: true,
      dataCount: syncMetadata.dataCount,
      timestamp: syncMetadata.timestamp,
      mode: SYNC_MODE,
      message: `Đã kiểm tra + sao lưu cục bộ ${syncMetadata.dataCount} mục (chế độ ${SYNC_MODE}, chưa đồng bộ cloud)`,
    };
  } catch (error) {
    console.error("Sync error:", error);
    updateSyncStatus(syncType, {
      status: SYNC_STATUS.ERROR,
      errorMessage: error.message || "Lỗi đồng bộ không xác định",
    });

    return {
      success: false,
      error: error.message || "Lỗi đồng bộ không xác định",
    };
  }
}

/**
 * Get sync history for a specific data type
 * @param {string} syncType - Type of data to get history for
 * @returns {Array} Sync history
 */
function getSyncHistory(syncType = SYNC_TYPES.ALL) {
  try {
    const historyKey = `${STORAGE_KEYS.SYNC_HISTORY_PREFIX}${syncType}`;
    return safeGetJSON(historyKey, [], Array.isArray);
  } catch (error) {
    console.error("Error getting sync history:", error);
    return [];
  }
}

/**
 * Add entry to sync history
 * @param {string} syncType - Type of data
 * @param {Object} entry - History entry
 */
function addSyncHistoryEntry(syncType, entry) {
  try {
    const historyKey = `${STORAGE_KEYS.SYNC_HISTORY_PREFIX}${syncType}`;
    const history = getSyncHistory(syncType);
    history.unshift({
      ...entry,
      timestamp: Date.now(),
    });

    // Keep only last 20 entries
    const trimmedHistory = history.slice(0, 20);
    const r = safeSetJSON(historyKey, trimmedHistory);
    if (!r.ok) console.warn("[syncService] save history failed", historyKey, r.error);
  } catch (error) {
    console.error("Error adding sync history entry:", error);
  }
}

/**
 * Get all sync statuses across all data types
 * @returns {Object} All sync statuses
 */
function getAllSyncStatuses() {
  const statuses = {};
  Object.values(SYNC_TYPES).forEach((type) => {
    if (type !== SYNC_TYPES.ALL) {
      statuses[type] = getSyncStatus(type);
    }
  });
  return statuses;
}

/**
 * Reset sync status for a specific data type
 * @param {string} syncType - Type of data to reset
 */
function resetSyncStatus(syncType) {
  try {
    const statusKey = `${STORAGE_KEYS.SYNC_STATUS_PREFIX}${syncType}`;
    const r = safeRemove(statusKey);
    if (!r.ok) console.warn("[syncService] remove status failed", statusKey, r.error);

    appEvents.emit(AppEvents.SYNC_STATUS_UPDATED, { syncType, status: null });
  } catch (error) {
    console.error("Error resetting sync status:", error);
  }
}

/**
 * Export data for backup/export purposes
 * @param {string} syncType - Type of data to export
 * @returns {Object} Export data
 */
function exportData(syncType = SYNC_TYPES.ALL) {
  const data = collectData(syncType);
  const metadata = {
    exportDate: new Date().toISOString(),
    version: "1.0",
    syncType,
    dataCount: Array.isArray(data) ? data.length : Object.keys(data).length,
  };

  return {
    metadata,
    data,
  };
}

/**
 * Import data from backup/export
 * @param {Object} importData - Data to import
 * @param {Object} options - Import options
 * @returns {Promise<Object>} Import result
 */
async function importData(importData, options = {}) {
  const {
    merge = true,
    validate = true,
    resolveConflicts = "keep-both",
  } = options;

  try {
    if (!importData || !importData.data) {
      throw new Error("Dữ liệu nhập không hợp lệ");
    }

    const { metadata, data } = importData;
    const syncType = metadata?.syncType || SYNC_TYPES.ALL;

    updateSyncStatus(syncType, {
      status: SYNC_STATUS.SYNCING,
      startTime: Date.now(),
    });

    // Validate if requested
    if (validate && syncType !== SYNC_TYPES.ALL) {
      const validation = validateData(syncType, data);
      if (!validation.valid) {
        updateSyncStatus(syncType, {
          status: SYNC_STATUS.ERROR,
          errorMessage: `Xác thực thất bại: ${validation.issues.join(", ")}`,
        });
        return {
          success: false,
          error: validation.issues.join(", "),
        };
      }
    }

    // Detect conflicts
    const conflicts = detectConflicts(syncType, data);

    if (conflicts.length > 0 && resolveConflicts === "manual") {
      updateSyncStatus(syncType, {
        status: SYNC_STATUS.CONFLICT,
        errorMessage: `Phát hiện ${conflicts.length} xung đột - cần giải quyết thủ công`,
        conflicts,
      });

      return {
        success: false,
        error: "Xung đột dữ liệu phát hiện",
        conflicts,
        requiresResolution: true,
      };
    }

    // Import data based on type with conflict resolution
    switch (syncType) {
      case SYNC_TYPES.QUESTIONS:
        if (merge) {
          const existing = collectData(SYNC_TYPES.QUESTIONS);
          const resolved = resolveDataConflicts(
            existing,
            data,
            resolveConflicts,
            "id",
          );
          const r = safeSetJSON(STORAGE_KEYS.QUESTIONS, resolved.data);
          if (!r.ok) console.warn("[syncService] import questions failed", r.error);
        } else {
          const r = safeSetJSON(STORAGE_KEYS.QUESTIONS, data);
          if (!r.ok) console.warn("[syncService] import questions failed", r.error);
        }
        break;

      case SYNC_TYPES.LESSON_PLANS:
        if (merge) {
          const existing = collectData(SYNC_TYPES.LESSON_PLANS);
          const resolved = resolveDataConflicts(
            existing,
            data,
            resolveConflicts,
            "id",
          );
          const r = writeLessonPlans(resolved.data);
          if (!r.ok) console.warn("[syncService] import lessonPlans failed", r.error);
        } else {
          const r = writeLessonPlans(data);
          if (!r.ok) console.warn("[syncService] import lessonPlans failed", r.error);
        }
        break;

      case SYNC_TYPES.ACTIVITIES:
        if (merge) {
          const existing = collectData(SYNC_TYPES.ACTIVITIES);
          const resolved = resolveDataConflicts(
            existing,
            data,
            resolveConflicts,
            "id",
          );
          const r = safeSetJSON(STORAGE_KEYS.ACTIVITIES, resolved.data);
          if (!r.ok) console.warn("[syncService] import activities failed", r.error);
        } else {
          const r = safeSetJSON(STORAGE_KEYS.ACTIVITIES, data);
          if (!r.ok) console.warn("[syncService] import activities failed", r.error);
        }
        break;

      case SYNC_TYPES.ALL: {
        // Nhập đủ 9 loại (trước đây chỉ 3/9, 6 loại còn lại bị nuốt im lặng).
        const ALL_MAP = [
          [SYNC_TYPES.QUESTIONS, "questions", STORAGE_KEYS.QUESTIONS, null],
          [SYNC_TYPES.LESSON_PLANS, "lessonPlans", STORAGE_KEYS.KHBD_V2_PLANS, "plans"],
          [SYNC_TYPES.ACTIVITIES, "activities", STORAGE_KEYS.ACTIVITIES, null],
          [SYNC_TYPES.WORKSHEETS, "worksheets", STORAGE_KEYS.WORKSHEETS, null],
          [SYNC_TYPES.VOCABULARY, "vocabulary", STORAGE_KEYS.VOCAB, null],
          [SYNC_TYPES.BOOKMARKS, "bookmarks", STORAGE_KEYS.BOOKMARKS, "object"],
          [SYNC_TYPES.CLIPS, "clips", STORAGE_KEYS.CLIPS, null],
          [SYNC_TYPES.REFS, "refs", STORAGE_KEYS.REFS, null],
          [SYNC_TYPES.CONCEPTS, "concepts", STORAGE_KEYS.CONCEPTS, null],
        ];
        for (const [type, field, lsKey, special] of ALL_MAP) {
          const incoming = data[field];
          if (incoming == null) continue;
          if (special === "object") {
            // bookmarks là object: merge theo file
            if (merge && typeof incoming === "object" && !Array.isArray(incoming)) {
              const existing = collectData(type) || {};
              const merged = { ...existing };
              for (const [f, pages] of Object.entries(incoming)) {
                if (!Array.isArray(pages)) continue;
                const set = new Set([...(existing[f] || []), ...pages]);
                merged[f] = [...set].sort((a, b) => a - b);
              }
              const r = safeSetJSON(lsKey, merged);
              if (!r.ok) console.warn("[syncService] import bookmarks (ALL) failed", r.error);
            } else {
              const r = safeSetJSON(lsKey, incoming);
              if (!r.ok) console.warn("[syncService] import bookmarks (ALL) failed", r.error);
            }
            continue;
          }
          if (!Array.isArray(incoming)) continue;
          const existing = collectData(type);
          const resolved = resolveDataConflicts(
            Array.isArray(existing) ? existing : [],
            incoming,
            resolveConflicts,
            "id",
          );
          const r = special === "plans" ? writeLessonPlans(resolved.data) : safeSetJSON(lsKey, resolved.data);
          if (!r.ok) console.warn(`[syncService] import ${field} (ALL) failed`, r.error);
        }
        break;
      }

      default: {
        // Các loại đơn còn lại (worksheets/vocabulary/bookmarks/clips/refs/concepts):
        // xử lý generic thay vì throw, để export/import đơn loại hoạt động được.
        const SINGLE_MAP = {
          [SYNC_TYPES.WORKSHEETS]: STORAGE_KEYS.WORKSHEETS,
          [SYNC_TYPES.VOCABULARY]: STORAGE_KEYS.VOCAB,
          [SYNC_TYPES.CLIPS]: STORAGE_KEYS.CLIPS,
          [SYNC_TYPES.REFS]: STORAGE_KEYS.REFS,
          [SYNC_TYPES.CONCEPTS]: STORAGE_KEYS.CONCEPTS,
        };
        if (SINGLE_MAP[syncType] && Array.isArray(data)) {
          if (merge) {
            const existing = collectData(syncType);
            const resolved = resolveDataConflicts(
              Array.isArray(existing) ? existing : [],
              data,
              resolveConflicts,
              "id",
            );
            const r = safeSetJSON(SINGLE_MAP[syncType], resolved.data);
            if (!r.ok) console.warn(`[syncService] import ${syncType} failed`, r.error);
          } else {
            const r = safeSetJSON(SINGLE_MAP[syncType], data);
            if (!r.ok) console.warn(`[syncService] import ${syncType} failed`, r.error);
          }
          break;
        }
        if (syncType === SYNC_TYPES.BOOKMARKS && data && typeof data === "object") {
          const r = safeSetJSON(STORAGE_KEYS.BOOKMARKS, data);
          if (!r.ok) console.warn("[syncService] import bookmarks failed", r.error);
          break;
        }
        throw new Error(`Loại đồng bộ không hỗ trợ: ${syncType}`);
      }
    }

    updateSyncStatus(syncType, {
      status: SYNC_STATUS.SUCCESS,
      lastSync: Date.now(),
      errorMessage: null,
    });

    // Add to history
    addSyncHistoryEntry(syncType, {
      action: "import",
      source: metadata.exportDate,
      itemCount: Array.isArray(data) ? data.length : Object.keys(data).length,
      conflictsResolved: conflicts.length,
    });

    appEvents.emit(AppEvents.DATA_UPDATED, { source: "sync-import", syncType });

    return {
      success: true,
      message: "Nhập dữ liệu thành công",
      itemCount: Array.isArray(data) ? data.length : Object.keys(data).length,
      conflictsResolved: conflicts.length,
    };
  } catch (error) {
    console.error("Import error:", error);
    updateSyncStatus(importData?.metadata?.syncType || SYNC_TYPES.ALL, {
      status: SYNC_STATUS.ERROR,
      errorMessage: error.message,
    });

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Detect conflicts between existing and incoming data
 * @param {string} syncType - Type of data to check
 * @param {Array} incomingData - New data to import
 * @returns {Array} List of conflicts detected
 */
function detectConflicts(syncType, incomingData) {
  try {
    const existingData = collectData(syncType);
    const conflicts = [];

    if (!Array.isArray(existingData) || !Array.isArray(incomingData)) {
      return conflicts;
    }

    // So sánh theo id + diff nội dung (shallow JSON) để phân biệt
    // "trùng y hệt" vs "cùng id khác nội dung".
    const existingMap = new Map(existingData.map((item) => [item?.id, item]));
    for (const item of incomingData) {
      if (!item || item.id == null) continue;
      if (existingMap.has(item.id)) {
        const existingItem = existingMap.get(item.id);
        let identical = false;
        try {
          identical = JSON.stringify(existingItem) === JSON.stringify(item);
        } catch { identical = false; }
        conflicts.push({
          id: item.id,
          type: syncType,
          existing: existingItem,
          incoming: item,
          conflictType: identical ? "identical" : "modified",
        });
      }
    }

    return conflicts;
  } catch (error) {
    console.error("Error detecting conflicts:", error);
    return [];
  }
}

/**
 * Resolve data conflicts based on strategy
 * @param {Array} existing - Existing data
 * @param {Array} incoming - Incoming data
 * @param {string} strategy - Resolution strategy ('keep-existing', 'keep-incoming', 'keep-both', 'keep-newer')
 * @param {string} idField - Field to use as unique identifier
 * @returns {Object} Resolution result with data and stats
 */
function resolveDataConflicts(existing, incoming, strategy, idField = "id") {
  const result = {
    data: [],
    stats: {
      existingKept: 0,
      incomingKept: 0,
      conflictsResolved: 0,
      duplicatesRemoved: 0,
    },
  };

  const existingMap = new Map(existing.map((item) => [item[idField], item]));
  const incomingMap = new Map(incoming.map((item) => [item[idField], item]));
  const allIds = new Set([...existingMap.keys(), ...incomingMap.keys()]);

  allIds.forEach((id) => {
    const existingItem = existingMap.get(id);
    const incomingItem = incomingMap.get(id);

    if (existingItem && incomingItem) {
      // Conflict detected
      result.stats.conflictsResolved++;

      switch (strategy) {
        case "keep-existing":
          result.data.push(existingItem);
          result.stats.existingKept++;
          break;
        case "keep-incoming":
          result.data.push(incomingItem);
          result.stats.incomingKept++;
          break;
        case "keep-both": {
          // Giữ cả hai với ID duy nhất cho bản incoming (counter + random để
          // import hàng loạt cùng ms không trùng nhau; import lặp không rác vô hạn
          // vì detectConflicts đã phân biệt identical/modified).
          const stamp = Date.now().toString(36);
          const rand = Math.random().toString(36).slice(2, 6);
          const n = result.data.length;
          const modifiedIncoming = {
            ...incomingItem,
            [idField]: `${id}_import_${stamp}${n}_${rand}`,
          };
          result.data.push(existingItem, modifiedIncoming);
          result.stats.existingKept++;
          result.stats.incomingKept++;
          break;
        }
        case "keep-newer": {
          const tsOf = (o) => Number(
            o?.updatedAt ?? o?.createdAt ?? o?.at ?? 0,
          ) || 0;
          const existingTime = tsOf(existingItem);
          const incomingTime = tsOf(incomingItem);
          if (incomingTime > existingTime) {
            result.data.push(incomingItem);
            result.stats.incomingKept++;
          } else {
            result.data.push(existingItem);
            result.stats.existingKept++;
          }
          break;
        }
        default:
          result.data.push(existingItem);
          result.stats.existingKept++;
      }
    } else if (existingItem) {
      result.data.push(existingItem);
      result.stats.existingKept++;
    } else if (incomingItem) {
      result.data.push(incomingItem);
      result.stats.incomingKept++;
    }
  });

  return result;
}

/**
 * Get detailed conflict information for manual resolution
 * @param {string} syncType - Type of data
 * @param {Array} conflicts - Conflict list
 * @returns {Object} Detailed conflict information
 */
function getConflictDetails(syncType, conflicts) {
  return {
    count: conflicts.length,
    byType: conflicts.reduce((acc, conflict) => {
      acc[conflict.type] = (acc[conflict.type] || 0) + 1;
      return acc;
    }, {}),
    items: conflicts.map((conflict) => ({
      id: conflict.id,
      type: conflict.type,
      existingTimestamp:
        conflict.existing?.updatedAt || conflict.existing?.createdAt,
      incomingTimestamp:
        conflict.incoming?.updatedAt || conflict.incoming?.createdAt,
      existingSummary: getConflictSummary(conflict.existing),
      incomingSummary: getConflictSummary(conflict.incoming),
    })),
  };
}

/**
 * Get a summary of an item for conflict display
 * @param {Object} item - Data item
 * @returns {string} Summary string
 */
function getConflictSummary(item) {
  if (!item) return "";

  switch (typeof item) {
    case "object":
      if (item.question) return item.question.substring(0, 50) + "...";
      if (item.title) return item.title.substring(0, 50) + "...";
      if (item.name) return item.name.substring(0, 50) + "...";
      return JSON.stringify(item).substring(0, 50) + "...";
    default:
      return String(item).substring(0, 50) + "...";
  }
}

export default {
  SYNC_TYPES,
  SYNC_STATUS,
  getSyncStatus,
  updateSyncStatus,
  performSync,
  getSyncHistory,
  addSyncHistoryEntry,
  getAllSyncStatuses,
  resetSyncStatus,
  exportData,
  importData,
  collectData,
  validateData,
  detectConflicts,
  resolveDataConflicts,
  getConflictDetails,
};
