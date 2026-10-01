// ── AI Data Storage Module ───────────────────────────────────────────────
// Module for storing AI analysis results, image data, and related metadata
// Provides persistent storage for AI-generated content and analysis history
import { safeGetJSON, safeSetJSON, safeGetString, safeRemove } from "./safeStorage.js";

import { appEvents, AppEvents } from "./core/appEvents.js";
function notifyDataUpdated(detail){ try{ appEvents.emit(AppEvents.DATA_UPDATED, detail||{source:"aiDataStorage"});}catch (e){ console.warn("[aiDataStorage] appEvents emit failed", e); } }

function setJSONNotify(k, value){
  const res = safeSetJSON(k, value);
  if (res.ok) {
    notifyDataUpdated({source:"aiDataStorage", key:k});
    return true;
  }
  // quota handling with LRU eviction retry
  if (res.quota) {
    console.warn(`[safeStorage] Quota exceeded for ${k}, attempting LRU eviction:`, res.message);
    try{
      if(k === STORAGE_KEYS.ANALYSIS_HISTORY){
        const arr = Array.isArray(value) ? value : [];
        if(arr.length > 20){
          const trimmed = arr.slice(0, 20);
          const r2 = safeSetJSON(k, trimmed);
          if (r2.ok) { notifyDataUpdated({source:"aiDataStorage", key:k}); return true; }
          if (!r2.ok && r2.quota) console.warn("[safeStorage] Quota still exceeded after trimming ANALYSIS_HISTORY", r2.message);
          else if (!r2.ok) console.warn("[safeStorage] Failed to save trimmed ANALYSIS_HISTORY", r2.message);
        }
      }
      if(k === STORAGE_KEYS.IMAGE_CACHE){
        const obj = value && typeof value === "object" ? value : {};
        const entries = Object.entries(obj);
        if(entries.length > 10){
          entries.sort((a,b)=> (a[1].cachedAt||0)-(b[1].cachedAt||0));
          const keep = Object.fromEntries(entries.slice(-10));
          const r2 = safeSetJSON(k, keep);
          if (r2.ok) { notifyDataUpdated({source:"aiDataStorage", key:k}); return true; }
          if (!r2.ok && r2.quota) console.warn("[safeStorage] Quota still exceeded after trimming IMAGE_CACHE", r2.message);
          else if (!r2.ok) console.warn("[safeStorage] Failed to save trimmed IMAGE_CACHE", r2.message);
        }
      }
      // Generic: clear oldest AI cache keys and retry original value
      safeRemove(STORAGE_KEYS.IMAGE_CACHE);
      const r3 = safeSetJSON(k, value);
      if (r3.ok) { notifyDataUpdated({source:"aiDataStorage", key:k}); return true; }
      if (!r3.ok) {
        if (r3.quota) console.warn("[safeStorage] Quota exceeded on retry for", k, r3.message);
        else console.warn("[safeStorage] Failed to save on retry for", k, r3.message);
      }
    }catch(retryErr){
      console.warn(`[aiDataStorage] Retry after quota eviction failed for ${k}:`, retryErr);
    }
    // giữ dữ liệu cũ, không xóa, không báo saved giả
    return false;
  }
  console.warn(`[safeStorage] Failed to save ${k}:`, res.message);
  // giữ dữ liệu cũ, không xóa, không báo saved giả
  return false;
}

// Legacy wrapper giữ tương thích nếu caller truyền string
function setItemNotify(k,v){
  let parsed;
  try { parsed = JSON.parse(v); } catch (e) { console.warn("[aiDataStorage] setItemNotify parse string failed, fallback to raw string", e); const r = safeSetJSON(k, v); if (r.ok) notifyDataUpdated({source:"aiDataStorage", key:k}); else if (r.quota) console.warn("[safeStorage] Quota", r.message); else console.warn("[safeStorage] Failed", r.message); return r.ok; }
  return setJSONNotify(k, parsed);
}

/**
 * Storage keys for AI-related data
 */
const STORAGE_KEYS = {
  ANALYSIS_HISTORY: 'ai_analysis_history',
  IMAGE_CACHE: 'ai_image_cache',
  PROMPT_TEMPLATES: 'ai_prompt_templates',
  ANALYSIS_RESULTS: 'ai_analysis_results',
  MODEL_PREFERENCES: 'ai_model_preferences',
  USAGE_STATS: 'ai_usage_stats'
};

// validators
const isArray = Array.isArray;
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Get analysis history from localStorage
 * @param {Object} filters - Optional filters for history
 * @returns {Array} Analysis history
 */
function getAnalysisHistory(filters = {}) {
  try {
    const history = safeGetJSON(STORAGE_KEYS.ANALYSIS_HISTORY, [], isArray);
    if (!Array.isArray(history)) return [];
    
    let filtered = history;
    // Apply filters if provided
    if (filters.type) {
      filtered = filtered.filter(entry => entry.type === filters.type);
    }
    if (filters.startDate) {
      filtered = filtered.filter(entry => entry.timestamp >= filters.startDate);
    }
    if (filters.endDate) {
      filtered = filtered.filter(entry => entry.timestamp <= filters.endDate);
    }
    if (filters.success !== undefined) {
      filtered = filtered.filter(entry => entry.success === filters.success);
    }
    
    // Sort by timestamp descending
    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.warn('[aiDataStorage] Error getting analysis history:', error);
    return [];
  }
}

/**
 * Add entry to analysis history
 * @param {Object} entry - Analysis entry to add
 * @returns {boolean} Success status
 */
function addAnalysisHistoryEntry(entry) {
  try {
    const history = getAnalysisHistory();
    
    const newEntry = {
      id: `analysis_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      ...entry
    };
    
    history.unshift(newEntry);
    
    // Keep only last 100 entries
    const trimmedHistory = history.slice(0, 100);
    return setJSONNotify(STORAGE_KEYS.ANALYSIS_HISTORY, trimmedHistory);
    
  } catch (error) {
    console.warn('[aiDataStorage] Error adding analysis history entry:', error);
    return false;
  }
}

/**
 * Clear analysis history
 * @param {Object} filters - Optional filters to clear specific entries
 * @returns {boolean} Success status
 */
function clearAnalysisHistory(filters = {}) {
  try {
    if (Object.keys(filters).length === 0) {
      safeRemove(STORAGE_KEYS.ANALYSIS_HISTORY);
      notifyDataUpdated({source:"aiDataStorage", key:STORAGE_KEYS.ANALYSIS_HISTORY});
      return true;
    }
    
    const history = getAnalysisHistory();
    const filtered = history.filter(entry => {
      if (filters.type && entry.type !== filters.type) return false;
      if (filters.startDate && entry.timestamp < filters.startDate) return false;
      if (filters.endDate && entry.timestamp > filters.endDate) return false;
      return true;
    });
    
    return setJSONNotify(STORAGE_KEYS.ANALYSIS_HISTORY, filtered);
  } catch (error) {
    console.warn('[aiDataStorage] Error clearing analysis history:', error);
    return false;
  }
}

/**
 * Store image data in cache
 * @param {string} imageId - Unique image identifier
 * @param {string} base64Data - Base64 encoded image data
 * @param {Object} metadata - Image metadata
 * @returns {boolean} Success status
 */
function cacheImage(imageId, base64Data, metadata = {}) {
  try {
    const cache = getImageCache();
    
    cache[imageId] = {
      data: base64Data,
      cachedAt: Date.now(),
      ...metadata
    };
    
    // Limit cache size (keep last 50 images)
    const entries = Object.entries(cache);
    if (entries.length > 50) {
      const sorted = entries.sort((a, b) => a[1].cachedAt - b[1].cachedAt);
      const toRemove = sorted.slice(0, entries.length - 50);
      toRemove.forEach(([id]) => delete cache[id]);
    }
    
    return setJSONNotify(STORAGE_KEYS.IMAGE_CACHE, cache);
  } catch (error) {
    console.warn('[aiDataStorage] Error caching image:', error);
    return false;
  }
}

/**
 * Get image from cache
 * @param {string} imageId - Image identifier
 * @returns {Object|null} Cached image data or null
 */
function getCachedImage(imageId) {
  try {
    const cache = getImageCache();
    return cache[imageId] || null;
  } catch (error) {
    console.warn('[aiDataStorage] Error getting cached image:', error);
    return null;
  }
}

/**
 * Get all cached images
 * @returns {Object} All cached images
 */
function getImageCache() {
  try {
    return safeGetJSON(STORAGE_KEYS.IMAGE_CACHE, {}, isPlainObject);
  } catch (error) {
    console.warn('[aiDataStorage] Error getting image cache:', error);
    return {};
  }
}

/**
 * Clear image cache
 * @param {string} imageId - Optional specific image ID to clear
 * @returns {boolean} Success status
 */
function clearImageCache(imageId = null) {
  try {
    if (imageId) {
      const cache = getImageCache();
      delete cache[imageId];
      return setJSONNotify(STORAGE_KEYS.IMAGE_CACHE, cache);
    } else {
      safeRemove(STORAGE_KEYS.IMAGE_CACHE);
      notifyDataUpdated({source:"aiDataStorage", key:STORAGE_KEYS.IMAGE_CACHE});
    }
    return true;
  } catch (error) {
    console.warn('[aiDataStorage] Error clearing image cache:', error);
    return false;
  }
}

/**
 * Store analysis result
 * @param {string} resultId - Unique result identifier
 * @param {Object} result - Analysis result data
 * @returns {boolean} Success status
 */
function storeAnalysisResult(resultId, result) {
  try {
    const results = getAnalysisResults();
    
    results[resultId] = {
      ...result,
      storedAt: Date.now()
    };
    
    // Limit results storage (keep last 50 results)
    const entries = Object.entries(results);
    if (entries.length > 50) {
      const sorted = entries.sort((a, b) => a[1].storedAt - b[1].storedAt);
      const toRemove = sorted.slice(0, entries.length - 50);
      toRemove.forEach(([id]) => delete results[id]);
    }
    
    return setJSONNotify(STORAGE_KEYS.ANALYSIS_RESULTS, results);
  } catch (error) {
    console.warn('[aiDataStorage] Error storing analysis result:', error);
    return false;
  }
}

/**
 * Get analysis result
 * @param {string} resultId - Result identifier
 * @returns {Object|null} Analysis result or null
 */
function getAnalysisResult(resultId) {
  try {
    const results = getAnalysisResults();
    return results[resultId] || null;
  } catch (error) {
    console.warn('[aiDataStorage] Error getting analysis result:', error);
    return null;
  }
}

/**
 * Get all analysis results
 * @returns {Object} All analysis results
 */
function getAnalysisResults() {
  try {
    return safeGetJSON(STORAGE_KEYS.ANALYSIS_RESULTS, {}, isPlainObject);
  } catch (error) {
    console.warn('[aiDataStorage] Error getting analysis results:', error);
    return {};
  }
}

/**
 * Clear analysis results
 * @param {string} resultId - Optional specific result ID to clear
 * @returns {boolean} Success status
 */
function clearAnalysisResults(resultId = null) {
  try {
    if (resultId) {
      const results = getAnalysisResults();
      delete results[resultId];
      return setJSONNotify(STORAGE_KEYS.ANALYSIS_RESULTS, results);
    } else {
      safeRemove(STORAGE_KEYS.ANALYSIS_RESULTS);
      notifyDataUpdated({source:"aiDataStorage", key:STORAGE_KEYS.ANALYSIS_RESULTS});
    }
    return true;
  } catch (error) {
    console.warn('[aiDataStorage] Error clearing analysis results:', error);
    return false;
  }
}

/**
 * Store prompt template
 * @param {string} templateId - Template identifier
 * @param {Object} template - Template data
 * @returns {boolean} Success status
 */
function storePromptTemplate(templateId, template) {
  try {
    const templates = getPromptTemplates();
    
    templates[templateId] = {
      ...template,
      updatedAt: Date.now()
    };
    
    return setJSONNotify(STORAGE_KEYS.PROMPT_TEMPLATES, templates);
  } catch (error) {
    console.warn('[aiDataStorage] Error storing prompt template:', error);
    return false;
  }
}

/**
 * Get prompt template
 * @param {string} templateId - Template identifier
 * @returns {Object|null} Template or null
 */
function getPromptTemplate(templateId) {
  try {
    const templates = getPromptTemplates();
    return templates[templateId] || null;
  } catch (error) {
    console.warn('[aiDataStorage] Error getting prompt template:', error);
    return null;
  }
}

/**
 * Get all prompt templates
 * @returns {Object} All prompt templates
 */
function getPromptTemplates() {
  try {
    return safeGetJSON(STORAGE_KEYS.PROMPT_TEMPLATES, {}, isPlainObject);
  } catch (error) {
    console.warn('[aiDataStorage] Error getting prompt templates:', error);
    return {};
  }
}

/**
 * Update model preferences
 * @param {Object} preferences - Model preferences to update
 * @returns {boolean} Success status
 */
function updateModelPreferences(preferences) {
  try {
    const current = getModelPreferences();
    const updated = {
      ...current,
      ...preferences,
      updatedAt: Date.now()
    };
    
    return setJSONNotify(STORAGE_KEYS.MODEL_PREFERENCES, updated);
  } catch (error) {
    console.warn('[aiDataStorage] Error updating model preferences:', error);
    return false;
  }
}

/**
 * Get model preferences
 * @returns {Object} Model preferences
 */
function getModelPreferences() {
  try {
    const prefs = safeGetJSON(STORAGE_KEYS.MODEL_PREFERENCES, null, isPlainObject);
    if (prefs) return prefs;
    return {
      defaultModel: 'gemini-2.5-flash',
      temperature: 0.4,
      maxTokens: 2048
    };
  } catch (error) {
    console.warn('[aiDataStorage] Error getting model preferences:', error);
    return {
      defaultModel: 'gemini-2.5-flash',
      temperature: 0.4,
      maxTokens: 2048
    };
  }
}

/**
 * Record AI usage statistics
 * @param {Object} stats - Usage stats to record
 * @returns {boolean} Success status
 */
function recordUsageStats(stats) {
  try {
    const current = getUsageStats();
    
    const updated = {
      totalRequests: (current.totalRequests || 0) + (stats.requests || 0),
      successfulRequests: (current.successfulRequests || 0) + (stats.successful || 0),
      failedRequests: (current.failedRequests || 0) + (stats.failed || 0),
      totalTokens: (current.totalTokens || 0) + (stats.tokens || 0),
      lastUsed: Date.now(),
      ...stats,
      updatedAt: Date.now()
    };
    
    return setJSONNotify(STORAGE_KEYS.USAGE_STATS, updated);
  } catch (error) {
    console.warn('[aiDataStorage] Error recording usage stats:', error);
    return false;
  }
}

/**
 * Get usage statistics
 * @returns {Object} Usage statistics
 */
function getUsageStats() {
  try {
    const stats = safeGetJSON(STORAGE_KEYS.USAGE_STATS, null, isPlainObject);
    if (stats) return stats;
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      lastUsed: null
    };
  } catch (error) {
    console.warn('[aiDataStorage] Error getting usage stats:', error);
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      lastUsed: null
    };
  }
}

/**
 * Clear usage statistics
 * @returns {boolean} Success status
 */
function clearUsageStats() {
  try {
    safeRemove(STORAGE_KEYS.USAGE_STATS);
    notifyDataUpdated({source:"aiDataStorage", key:STORAGE_KEYS.USAGE_STATS});
    return true;
  } catch (error) {
    console.warn('[aiDataStorage] Error clearing usage stats:', error);
    return false;
  }
}

/**
 * Get storage usage information
 * @returns {Object} Storage usage data
 */
function getStorageUsage() {
  try {
    let totalSize = 0;
    const sizes = {};
    
    Object.values(STORAGE_KEYS).forEach(key => {
      const stored = safeGetString(key, null);
      if (stored) {
        const size = new Blob([stored]).size;
        sizes[key] = size;
        totalSize += size;
      }
    });
    
    return {
      totalSize,
      sizes,
      count: Object.keys(sizes).length,
      formatted: formatBytes(totalSize)
    };
  } catch (error) {
    console.warn('[aiDataStorage] Error getting storage usage:', error);
    return {
      totalSize: 0,
      sizes: {},
      count: 0,
      formatted: '0 bytes'
    };
  }
}

/**
 * Format bytes to human readable string
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 bytes';
  
  const k = 1024;
  const sizes = ['bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Clear all AI-related data
 * @returns {boolean} Success status
 */
function clearAllAIData() {
  try {
    Object.values(STORAGE_KEYS).forEach(key => {
      safeRemove(key);
    });
    notifyDataUpdated({source:"aiDataStorage", key:"clearAll"});
    return true;
  } catch (error) {
    console.warn('[aiDataStorage] Error clearing all AI data:', error);
    return false;
  }
}

/**
 * Export all AI data
 * @returns {Object} All AI data
 */
function exportAllAIData() {
  try {
    const data = {};
    
    Object.entries(STORAGE_KEYS).forEach(([name, key]) => {
      const validator = key === STORAGE_KEYS.ANALYSIS_HISTORY ? isArray : isPlainObject;
      const parsed = safeGetJSON(key, null, validator);
      if (parsed !== null) {
        data[name] = parsed;
      }
    });
    
    return {
      exportDate: new Date().toISOString(),
      version: '1.0',
      data
    };
  } catch (error) {
    console.warn('[aiDataStorage] Error exporting AI data:', error);
    return null;
  }
}

/**
 * Import AI data
 * @param {Object} importData - Data to import
 * @param {Object} options - Import options
 * @returns {boolean} Success status
 */
function importAIData(importData, options = {}) {
  const { merge = true } = options;
  
  try {
    if (!importData || !importData.data) {
      throw new Error('Invalid import data');
    }
    
    Object.entries(importData.data).forEach(([name, value]) => {
      const key = STORAGE_KEYS[name];
      if (key) {
        if (merge) {
          const validator = key === STORAGE_KEYS.ANALYSIS_HISTORY ? isArray : isPlainObject;
          const existing = safeGetJSON(key, null, validator);
          if (existing !== null) {
            const merged = Array.isArray(existing) && Array.isArray(value) ? [...value] : { ...existing, ...value };
            const res = safeSetJSON(key, merged);
            if (!res.ok) {
              if (res.quota) console.warn("[safeStorage] Quota importing", key, res.message);
              else console.warn("[safeStorage] Failed importing", key, res.message);
            } else notifyDataUpdated({source:"aiDataStorage", key});
          } else {
            const res = safeSetJSON(key, value);
            if (!res.ok) {
              if (res.quota) console.warn("[safeStorage] Quota importing", key, res.message);
              else console.warn("[safeStorage] Failed importing", key, res.message);
            } else notifyDataUpdated({source:"aiDataStorage", key});
          }
        } else {
          const res = safeSetJSON(key, value);
          if (!res.ok) {
            if (res.quota) console.warn("[safeStorage] Quota importing", key, res.message);
            else console.warn("[safeStorage] Failed importing", key, res.message);
          } else notifyDataUpdated({source:"aiDataStorage", key});
        }
      }
    });
    
    return true;
  } catch (error) {
    console.warn('[aiDataStorage] Error importing AI data:', error);
    return false;
  }
}

export default {
  STORAGE_KEYS,
  getAnalysisHistory,
  addAnalysisHistoryEntry,
  clearAnalysisHistory,
  cacheImage,
  getCachedImage,
  getImageCache,
  clearImageCache,
  storeAnalysisResult,
  getAnalysisResult,
  getAnalysisResults,
  clearAnalysisResults,
  storePromptTemplate,
  getPromptTemplate,
  getPromptTemplates,
  updateModelPreferences,
  getModelPreferences,
  recordUsageStats,
  getUsageStats,
  clearUsageStats,
  getStorageUsage,
  clearAllAIData,
  exportAllAIData,
  importAIData
};
