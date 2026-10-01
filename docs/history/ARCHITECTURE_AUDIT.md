> **Baseline lịch sử** — số liệu của giai đoạn đó, KHÔNG phản ánh hiện trạng.
> Bản mới: docs/ARCHITECTURE.md / docs/AUDIO.md / docs/TECHNICAL_DEBT.md. Chuyển vào docs/history/ ngày 2026-09-30.


# ARCHITECTURE_AUDIT.md — SGK App Unified Architecture Audit

> Generated: 2026-09-14 | Phase 2 — Whiteboard IDB + Hybrid dedup + Blob backup (verified build)

## 1. Snapshot: Architecture Trước

```
APP (App.jsx ~2700 lines, state-heavy)
 ↓
NAVIGATION (3 competing sources)
  - App.jsx inline NAV_SECTIONS + FOOTER_NAV + expandedSections (8 sections, 23 views)
  - components/Navigation.jsx MainNavigation (4 groups, 17 views, nested)
  - components/navigationConfig.js NAVIGATION_CONFIG (4 groups, 6+3+1+1 views)
  - navigationConfig.js FOOTER_NAV (4 items, orphan import)
 ↓
MODULES (23 views via lazy, inline switch view===)
 ↓
 DATA SERVICES (unified)
  - storage.js (BACKUP_KEYS re-export core, saveBatch, Blob serialize, hybrid migration v3, WB migration)
  - safeStorage.js (12 direct LS, validator + quota, backupCorrupted, listKeys)
  - indexedDB.js (9 stores v4: ocr_cache, search_index, clips, refs, concepts, evidence, scan_assets, wb_images, whiteboard_boards)
  - whiteboard/imageStore.js (WB_IMAGES in STORES, legacy SGKWhiteboardDB migrated)
  - whiteboard/whiteboardStore.js (boards canonical IDB whiteboard_boards + LS legacy fallback + migrateWhiteboardToIDB)
  - userdata.js (bookmarks/vocab/quiz)
  - teachingDB.js (lessonplans/activities/worksheets/questions)
  - researchDB.js (clips/refs/concepts/evidence — IDB canonical, LS fallback cleared after verify)
  - aiDataStorage.js (6 keys, LRU trimming)
  - missionStore/Events
  - syncService.js (LOCAL_SIMULATION)
  - scanStore (LS thumb 50 + IDB scan_assets full)
  - settingsStore (sgk_settings)
 ↓
 STORAGE (single contract: APP -> storageAdapter -> safeStorage/IndexedDB, whitelist only)
 ↓
EVENT BUS (23 distinct sgk:* strings, window CustomEvent + synthetic storage)
 ↓
INTEGRATION (ad-hoc: sgk:send-to-whiteboard, sgk:navigate, sgk:open-source)
```

## 2. Dependency Graph Summary

- No hard static import cycles detected; conceptual cycle via `window` events (`DATA_UPDATED` catch-all → re-emit `storage` → `DATA_UPDATED`).
- `storage.js ↔ indexedDB.js` one-way; `researchDB → indexedDB`; `teachingDB → khbdDomain → ...` acyclic.
- `App.jsx` dynamic imports inside `useEffect` for storage/indexedDB (lazy cycle avoid).

## 3. Duplicate Logic

| Area | Duplication | Files |
|---|---|---|
| Navigation config | 4 sources defining same views | App.jsx L1476, components/Navigation.jsx L30, components/navigationConfig.js, navigationConfig.js |
| Storage helpers | readJSON/saveJSON/getList triple | storage.js L12, userdata.js L19, teachingDB L7-19, researchDB L13, aiDataStorage L9, safeStorage L48 |
| Cache key lists | Same 11 prefixes repeated | storage.js L441, settingsStore.js L222, App.jsx L829 |
| Backup key lists | 45 prefixes only in storage.js but callers use string literals | storage.js L356, dataIntegrity, tests |
| Event names | `sgk:data-updated` dispatched 12+ places, listened 20+ | userdata, researchDB, teachingDB, aiDataStorage, storage, App, BookReader |
| View id literals | 60+ hard-coded `"dashboard"` etc | App.jsx 30+, navigationConfig 13, Navigation.jsx 17 |
| isCache/isBackup helpers | duplicated | storage.js, settingsStore, dataIntegrity |

## 4. Storage Inventory (Phase 2 verified)

**Persistent USER DATA (BACKUP_KEYS, IDB canonical where noted):**
- LS: `sgk_bookmarks`, `sgk_bookmark_labels`, `sgk_vocab`, `sgk_quiz_history`, `sgk_marks_*`, `sgk_teacherNotes_*`, `sgk_ideas/tasks/internship`, `sgk_lessonplans` (+legacy), `sgk_activities/worksheets/questions`, `sgk_custom_titles`, `sgk_settings`, `GEMINI_API_KEY`, missions 8 keys, AI 6 keys, `sgk_subject_catalog_v1`, `sgk_toc_custom_v1`, `lastPage_*/lastTotal_*` (USER DATA, NOT cache), `sgk_wb_pending`
- IDB canonical: `clips/refs/concepts/evidence` (STORES.CLIPS etc, LS fallback cleared after v3 verify), `scan_assets` (full) + LS `sgk_scans_v1` thumb 50, `whiteboard_boards` (STORES.WB_BOARDS) + `wb_images` (STORES.WB_IMAGES) — board JSON `{id,name,objects,connectors,viewport,settings,createdAt,updatedAt}` + imageId only, Blob URL runtime

**Cache/Rebuildable (CACHE_PREFIXES, NOT backed up, clearCache only):** `sgk_idx_*`, `sgk_idxmeta_*`, `sgk_index_*`, `sgk_meta_*`, `ocr_*`, `txt_*`, `chat_*`, `assistant_history`, `sgk_textbook_draft`, `toc_*` — lastPage/lastTotal KHÔNG còn trong cache

**Orphan/Legacy:** `SKG_TEACHER_MODE` typo, `favoriteTools`/`recentTools`, `__corrupted__*` — detected by `storageHealth.orphanAssets` (WB_IMAGES without board, SCAN without meta) report only, not auto-delete

## 5. IndexedDB Strategy (Phase 2)

- Main DB `SGKAppDB` **v4**, **9 stores**: `ocr_cache` (key), `search_index` (key), `clips`/`refs`/`concepts`/`evidence`/`scan_assets`/`wb_images`/`whiteboard_boards` (id). `WB_BOARDS` added Phase 2, `wb_images` migrated from isolated SGKWhiteboardDB.
- Hybrid LS->IDB migration v3: `clips/refs/concepts/evidence` — LS array -> IDB `set`, verify `getAll` count + id set, clear LS `[]`, mark `sgk_storage_migration_v3=3` idempotent. `storageAdapter` hybrid `domainSet` checks `isMigrated` and skips LS sync (except `scans` thumb).
- OCR dual: IDB preferred, LS `ocr_<file>_<page>` legacy; searchIndex similar.
- Whiteboard boards: IDB `whiteboard_boards` canonical, LS `sgk_wb_index`/`sgk_wb_board_*` legacy — `whiteboardStore.migrateWhiteboardToIDB()` verify before LS removal, `WB_MIGRATION_KEY=sgk_wb_migration_v1=1`.
- Whiteboard images: IDB `wb_images` Blob canonical, board stores `imageId` only, `blobToObjectURL` runtime, `stripEphemeralSrc` clears `blob:` before persist.
- Backup Blob serialization: `serializeWBRecord` Blob -> `{__blob:true,mimeType,size,data:base64}` via `arrayBuffer->base64` (Buffer/btoa chunked), restore `base64->Blob` via `Buffer/atob`, `keyPath WB_IMAGES:"id"` fixed.
- Canonical rule: **SMALL SETTINGS -> LS**, **USER DATA lớn/CACHE/LARGE BLOB/WHITEBOARD -> IDB** (spec Phase 2).

Settings MUST be single source: `settingsStore.js` (`sgk_settings`) is canonical; legacy `sgk_theme` mirrored via `safeSetString`; `SKG_TEACHER_MODE` typo handled in wipe.

## 7. Book Context Divergence

- `App.jsx` `currentBook` + `openInitialPage`; `BookReader` derives `chapterForPage` via `researchDB`; `LessonPlansView` stores `metadata.bookReference`; `Whiteboard` stores `sourceRef` per object; each module recomputed citation differently.
- Unified: `src/core/bookContext.js` `BookContext` / `makeBookContext` / `makeSourceRef` canonical; all modules import.

## 8. Source/Citation Flow

Spec: `BOOK → PAGE → TEXT/OCR → SOURCE → NOTE/CLIP/CONCEPT/KHBD/WHITEBOARD/AI`
- Current: BookReader → Clip (researchDB) keeps `file, page, chapter, citation`; Whiteboard `blankObject.sourceRef` keeps similar; KHBD `bookReference` similar but fields differ (`bookId` vs `filename`).
- Unified: `sourceRef: { filename, title, page, bookPage, chapter, citation, subject, grade }` carried via `integration.open()` contract.

## 9. Event System Conflicts

- 23 distinct `sgk:*`: `data-updated` (catch-all), `settings-updated`, `navigate`, `open-source`, `open-global-search`, `index-ready`, `send-to-whiteboard`, `whiteboard-updated`, `missions-updated`, `webtools-updated`, `storage-quota-exceeded`, etc. Names ad-hoc per module, no registry.
- Synthetic `new Event("storage")` dispatched 6 places (anti-pattern, not cross-tab).
- Unified: `src/core/appEvents.js` registry `AppEvents` + `DataDomains`; typed `emitDataUpdated({domain,action,id})`; backward-compat window dispatch retained.

## 10. Inconsistent Naming

- `sgk_lessonplans` vs `sgk_lessonPlans`; `marks` vs `bookmarks`; `stats` vs `langstats` (Navigation.jsx maps `stats`→`langstats` but navConfig maps `stats`→`stats`); `SKG_TEACHER_MODE` vs `SGK_TEACHER_MODE`; `sgk_idx_` vs `sgk_index_`; `ocr_/txt_`.

## 11. Dead / Unused

- `components/navigationConfig.js` exported but never imported (until now re-export).
- `navigationConfig.js` FOOTER_NAV orphan (App used inline).
- `components/Navigation.jsx` not imported by App (App renders inline sidebar).
- Duplicate `readJSON` in storage vs safeStorage; callers chose randomly.

## 12. Parallel Architectures To Remove

- 3 navigation systems → 1 (`core/navigationRegistry.js`)
- 2 storage read paths (`storage.saveJSON` vs `safeStorage.safeSetJSON`) → 1 (`safeStorage` low-level, `core/storageAdapter` high-level)
- 2 cache prefix arrays → 1 (`core/storageKeys`)
- 2 backup key checks → 1
- N event strings → 1 registry

## 13. Risks Before Fix

- QuotaExceeded without evacuation (aiDataStorage base64 images, whiteboard dataURL).
- Orphan scans/autosaves after book delete (already handled in storage.removeBookData but not for whiteboard images).
- `stats`/`langstats` confusion could route wrong view.
- `whiteboard/imageStore` missed on wipe/backup.

## 14. Plan → Phases 2-7

- Phase 2: core files created (`appEvents`, `storageKeys`, `storageAdapter`, `navigationRegistry`, `viewRegistry`, `bookContext`, `integration`, `errors`, `appContext`). Legacy re-exports wired.
- Phase 3: storage canonical strategy enforced, `settingsStore` + `safeStorage` as single path, migration safe.
- Phase 4: domain services emit via `appEvents`, read via `storageAdapter`.
- Phase 5: Book ↔ KHBD ↔ Whiteboard ↔ AI via `integration.open` + `BookContext`.
- Phase 6: `dataIntegrity` extended (`checkIntegrity`/`repairIntegrity` with backup), backup/restore covers all stores including `sgk_wb_images`.
- Phase 7: dashboard/search/AI/whiteboard integration verified, mobile checks, final report.

