// ── IndexedDB Service Layer ───────────────────────────────────────────────
// Centralized IndexedDB wrapper for large data storage (OCR, search index, clips)
// This addresses BUG-006: localStorage quota exceeded for large datasets
//
// Migration Strategy:
// - Large data (OCR, search index, clips, refs) → IndexedDB
// - Small data (bookmarks, vocab, settings) → localStorage (unchanged)
// - Gradual migration with fallback to localStorage

import { ocrKey as _ocrKey } from "./core/storageKeys.js";
import { safeGetString, safeSetString, safeRemove } from "./safeStorage.js";
const DB_NAME = 'SGKAppDB';
const DB_VERSION = 5;

// Store names
const STORES = {
  OCR: 'ocr_cache',
  SEARCH_INDEX: 'search_index',
  CLIPS: 'clips',
  REFS: 'refs',
  CONCEPTS: 'concepts',
  EVIDENCE: 'evidence',
  SCAN: 'scan_assets',
  WB_IMAGES: 'wb_images',
  WB_BOARDS: 'whiteboard_boards',
  NOTE_IMAGES: 'note_images',
};

// Key path configuration for each store
const STORE_KEY_PATHS = {
  [STORES.OCR]: 'key',
  [STORES.SEARCH_INDEX]: 'key',
  [STORES.CLIPS]: 'id',
  [STORES.REFS]: 'id',
  [STORES.CONCEPTS]: 'id',
  [STORES.EVIDENCE]: 'id',
  [STORES.SCAN]: 'id',
  [STORES.WB_IMAGES]: 'id',
  [STORES.WB_BOARDS]: 'id',
  [STORES.NOTE_IMAGES]: 'id',
};

function __isTestSilence() {
  try {
    if (globalThis.__SGK_TEST__ === true) return true;
    if (typeof process !== "undefined" && process?.env?.SGK_SILENCE_TEST_LOGS === "1") return true;
  } catch {}
  return false;
}

class IndexedDBService {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  /**
   * Initialize IndexedDB database
   */
  async init() {
    if (this.db) {
      return this.db;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    // Guard: Node/test env không có indexedDB — throw mã riêng để caller fallback im lặng,
    // tránh TypeError "Cannot read properties of undefined (reading 'open')" + console.error spam.
    if (!IndexedDBService.isAvailable()) {
      const e = new Error("IndexedDB unavailable");
      e.code = "IDB_UNAVAILABLE";
      throw e;
    }

    this.initPromise = new Promise((resolve, reject) => {
      let settled = false;

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        if (settled) return;
        settled = true;

        const error = request.error || new Error('IndexedDB initialization failed');
        this.initPromise = null;

        if (!__isTestSilence()) console.error('IndexedDB initialization failed:', error);
        reject(error);
      };

      request.onsuccess = () => {
        if (settled) return;
        settled = true;

        this.db = request.result;

        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
          this.initPromise = null;
        };

        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores with keyPath
        if (!db.objectStoreNames.contains(STORES.OCR)) {
          db.createObjectStore(STORES.OCR, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORES.SEARCH_INDEX)) {
          db.createObjectStore(STORES.SEARCH_INDEX, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORES.CLIPS)) {
          db.createObjectStore(STORES.CLIPS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.REFS)) {
          db.createObjectStore(STORES.REFS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.CONCEPTS)) {
          db.createObjectStore(STORES.CONCEPTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.EVIDENCE)) {
          db.createObjectStore(STORES.EVIDENCE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.SCAN)) {
          db.createObjectStore(STORES.SCAN, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.WB_IMAGES)) {
          db.createObjectStore(STORES.WB_IMAGES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.WB_BOARDS)) {
          db.createObjectStore(STORES.WB_BOARDS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.NOTE_IMAGES)) {
          db.createObjectStore(STORES.NOTE_IMAGES, { keyPath: 'id' });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Get a value from IndexedDB
   * @param {string} storeName - Store name
   * @param {string} key - Key to retrieve
   * @returns {Promise<any>} Value or null
   */
  async get(storeName, key) {
    try {
      await this.init();

      const keyPath = STORE_KEY_PATHS[storeName];
      if (!keyPath) {
        throw new Error(`Unknown IndexedDB store: ${storeName}`);
      }

      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const record = request.result;

          if (keyPath === 'key') {
            resolve(record?.value ?? null);
          } else {
            resolve(record ?? null);
          }
        };

        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      // IDB_UNAVAILABLE là trường hợp dự kiến trong Node/test — fallback LS im lặng.
      if (err?.code !== "IDB_UNAVAILABLE" && !__isTestSilence()) {
        console.error(`IndexedDB get failed for ${storeName}/${key}:`, err);
      }
      throw err;
    }
  }

  /**
   * Set a value in IndexedDB
   * @param {string} storeName - Store name
   * @param {string} key - Key to set
   * @param {any} value - Value to store
   * @returns {Promise<boolean>} Success status
   */
  async set(storeName, key, value) {
    try {
      await this.init();

      const keyPath = STORE_KEY_PATHS[storeName];
      if (!keyPath) {
        throw new Error(`Unknown IndexedDB store: ${storeName}`);
      }

      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      let record;

      if (keyPath === 'key') {
        record = {
          key,
          value,
        };
      } else {
        if (!value || typeof value !== 'object') {
          throw new Error(
            `Value for ${storeName} must be an object because keyPath is "${keyPath}"` 
          );
        }

        record = {
          ...value,
          [keyPath]: key,
        };
      }

      const request = store.put(record);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      if (err?.code !== "IDB_UNAVAILABLE" && !__isTestSilence()) {
        console.error(`IndexedDB set failed for ${storeName}/${key}:`, err);
      }
      return false;
    }
  }

  /**
   * Delete a value from IndexedDB
   * @param {string} storeName - Store name
   * @param {string} key - Key to delete
   * @returns {Promise<boolean>} Success status
   */
  async delete(storeName, key) {
    try {
      await this.init();
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      if (err?.code !== "IDB_UNAVAILABLE" && !__isTestSilence()) {
        console.error(`IndexedDB delete failed for ${storeName}/${key}:`, err);
      }
      return false;
    }
  }

  /**
   * Get all values from a store
   * @param {string} storeName - Store name
   * @returns {Promise<Array>} Array of values
   */
  async getAll(storeName) {
    try {
      await this.init();

      const keyPath = STORE_KEY_PATHS[storeName];
      if (!keyPath) {
        throw new Error(`Unknown IndexedDB store: ${storeName}`);
      }

      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const records = request.result || [];

          if (keyPath === 'key') {
            resolve(records.map(item => item.value));
          } else {
            resolve(records);
          }
        };

        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      if (err?.code !== "IDB_UNAVAILABLE" && !__isTestSilence()) {
        console.error(`IndexedDB getAll failed for ${storeName}:`, err);
      }
      return [];
    }
  }

  /**
   * Get all records from a store (preserves metadata like key)
   * @param {string} storeName - Store name
   * @returns {Promise<Array>} Array of raw records
   */
  async getAllRecords(storeName) {
    try {
      await this.init();

      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          resolve(request.result || []);
        };

        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      if (err?.code !== "IDB_UNAVAILABLE" && !__isTestSilence()) {
        console.error(`IndexedDB getAllRecords failed for ${storeName}:`, err);
      }
      return [];
    }
  }

  /**
   * Clear all values from a store
   * @param {string} storeName - Store name
   * @returns {Promise<boolean>} Success status
   */
  async clear(storeName) {
    try {
      await this.init();
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      if (err?.code !== "IDB_UNAVAILABLE" && !__isTestSilence()) {
        console.error(`IndexedDB clear failed for ${storeName}:`, err);
      }
      return false;
    }
  }

  /**
   * Check if IndexedDB is available
   * @returns {boolean} Availability status
   */
  static isAvailable() {
    try {
      // indexedDB có thể bị gán = undefined trong test (globalThis.indexedDB = undefined)
      // typeof vẫn là 'undefined' nhưng cũng cần check null + open là function để tránh TypeError.
      return typeof indexedDB !== 'undefined' && !!indexedDB && typeof indexedDB.open === 'function';
    } catch {
      return false;
    }
  }
}

// ── OCR Helper Functions with IndexedDB + localStorage fallback ─────────────
/**
 * Get OCR text for a specific book page
 * @param {string} bookFilename - Book filename
 * @param {number} page - Page number
 * @returns {Promise<string|null>} OCR text or null
 */
export async function getOCR(bookFilename, page) {
  const key = `${bookFilename}_${page}`;

  if (indexedDBService.constructor.isAvailable()) {
    try {
      const value = await indexedDBService.get(STORES.OCR, key);

      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    } catch (err) {
      if (err?.code !== "IDB_UNAVAILABLE" && !__isTestSilence()) console.error("IndexedDB OCR read failed:", err);
    }
  }

  return safeGetString(_ocrKey(bookFilename, page), null);
}

/**
 * Set OCR text for a specific book page
 * @param {string} bookFilename - Book filename
 * @param {number} page - Page number
 * @param {string} text - OCR text to store
 * @returns {Promise<boolean>} Success status
 */
export async function setOCR(bookFilename, page, text) {
  const key = `${bookFilename}_${page}`;

  if (indexedDBService.constructor.isAvailable()) {
    try {
      await indexedDBService.set(STORES.OCR, key, text);

      safeRemove(_ocrKey(bookFilename, page));

      return true;
    } catch (err) {
      if (err?.code !== "IDB_UNAVAILABLE" && !__isTestSilence()) console.error("IndexedDB OCR write failed:", err);
    }
  }

  {
    const r = safeSetString(_ocrKey(bookFilename, page), text);
    if (!r.ok) {
      if (!__isTestSilence()) console.error("localStorage OCR write failed:", r.message);
      return false;
    }
    return true;
  }
}

/**
 * Clear all data for a specific book from IndexedDB
 * @param {string} bookFilename - Book filename
 * @returns {Promise<boolean>} Success status
 */
export async function clearBookData(bookFilename) {
  if (!indexedDBService.constructor.isAvailable()) {
    if (!__isTestSilence()) console.debug('IndexedDB not available, skipping IndexedDB cleanup');
    return false;
  }

  try {
    // Delete OCR entries (keys start with bookFilename_)
    // Use getAllRecords to preserve key metadata for keyPath stores
    const allOCR = await indexedDBService.getAllRecords(STORES.OCR);
    const prefix = `${bookFilename}_`;
    for (const item of allOCR) {
      if (typeof item?.key === 'string' && item.key.startsWith(prefix)) {
        // Ensure next character after prefix is a digit (page number)
        // This prevents deleting Math.pdf-old_1 when deleting Math.pdf
        const afterPrefix = item.key.slice(prefix.length);
        if (afterPrefix.length > 0 && /^\d/.test(afterPrefix)) {
          await indexedDBService.delete(STORES.OCR, item.key);
        }
      }
    }

    // Delete search index for this book
    await indexedDBService.delete(STORES.SEARCH_INDEX, bookFilename);

    // Delete clips for this book (filter by file field)
    const allClips = await indexedDBService.getAll(STORES.CLIPS);
    for (const clip of allClips) {
      if (clip?.file === bookFilename) {
        await indexedDBService.delete(STORES.CLIPS, clip.id);
      }
    }

    // Delete refs for this book (filter by file field)
    const allRefs = await indexedDBService.getAll(STORES.REFS);
    for (const ref of allRefs) {
      if (ref?.file === bookFilename) {
        await indexedDBService.delete(STORES.REFS, ref.id);
      }
    }

    // Delete concepts for this book (filter by file field)
    const allConcepts = await indexedDBService.getAll(STORES.CONCEPTS);
    for (const concept of allConcepts) {
      if (concept?.file === bookFilename) {
        await indexedDBService.delete(STORES.CONCEPTS, concept.id);
      }
    }

    // Delete evidence for this book (filter by file field)
    const allEvidence = await indexedDBService.getAll(STORES.EVIDENCE);
    for (const item of allEvidence) {
      if (item?.file === bookFilename) {
        await indexedDBService.delete(STORES.EVIDENCE, item.id);
      }
    }

    // PHASE 3: Delete scan_assets for this book (filter by bookId / book.filename)
    try {
      const allScans = await indexedDBService.getAll(STORES.SCAN);
      for (const scan of allScans) {
        const bid = scan?.bookId || scan?.book?.filename || "";
        if (bid === bookFilename) {
          await indexedDBService.delete(STORES.SCAN, scan.id);
        }
      }
    } catch {}

    // NOTE IMAGES: xóa ảnh ghi chú của sách này (tránh rác IDB sau khi xóa sách)
    try {
      const allNoteImgs = await indexedDBService.getAll(STORES.NOTE_IMAGES);
      for (const rec of allNoteImgs) {
        if (rec?.bookFilename === bookFilename) {
          await indexedDBService.delete(STORES.NOTE_IMAGES, rec.id);
        }
      }
    } catch {}

    if (!__isTestSilence()) console.debug(`Cleared IndexedDB data for book: ${bookFilename}`);
    return true;
  } catch (err) {
    if (!__isTestSilence()) console.error(`Failed to clear IndexedDB data for ${bookFilename}:`, err);
    return false;
  }
}

// ── Clear all IndexedDB data (for wipe functionality) ─────────────────────
export async function clearAllIndexedDBData() {
  if (!indexedDBService.constructor.isAvailable()) {
    return false;
  }

  const stores = Object.values(STORES);

  let success = true;

  for (const store of stores) {
    const result = await indexedDBService.clear(store);

    if (!result) {
      success = false;
    }
  }

  return success;
}

// ── Export singleton instance ─────────────────────────────────────────────
const indexedDBService = new IndexedDBService();

export default indexedDBService;
export { STORES, IndexedDBService };
