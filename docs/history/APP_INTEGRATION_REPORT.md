> **Baseline lịch sử** — số liệu của giai đoạn đó, KHÔNG phản ánh hiện trạng.
> Bản mới: docs/ARCHITECTURE.md / docs/AUDIO.md / docs/TECHNICAL_DEBT.md. Chuyển vào docs/history/ ngày 2026-09-30.


# APP INTEGRATION REPORT — SGK Teacher Workspace Unified

> Version: 1.0 | Date: 2026-09-13 | Local/offline, no cloud dependency, backward-compatible migrations

## 1. Architecture Trước vs Sau

**Trước:**
- 4 navigation sources competing, 60+ hard-coded view literals, 3 sidebar implementations.
- ~300 direct `localStorage.*` hits + `safeStorage` wrappers duplicated, 2 cache prefix arrays, 2 backup key checks.
- 23 ad-hoc event strings, synthetic `storage` events, no typed contract.
- Hybrid IDB/LS for clips/refs/concepts/evidence with no canonical rule documented.
- Book context recomputed per module (citation drift).
- Whiteboard `sgk_wb_images` isolated DB not in wipe/backup.
- Integration via scattered `sgk:send-to-whiteboard`, `sgk:navigate`, `sgk:open-source`.

**Sau (unified):**
```
App (App.jsx) → NavigationRegistry (single source) → ViewRegistry (lazy)
            → AppEvents (typed bus) → StorageAdapter (domain contract)
            → Domain Services (teaching/research/ai/missions/whiteboard)
            → BookContext (shared) → Integration Hub (send-to-module)
            → DataIntegrity (check/repair with backup) → Backup/Restore (full)
```

## 2. Navigation Source of Truth

- **File:** `src/core/navigationRegistry.js` — canonical `VIEWS`, `NAVIGATION_CONFIG`, `FOOTER_NAV`, `VIEW_ALIASES`, `getBreadcrumb`, `buildNavSections`.
- **Legacy:** `src/navigationConfig.js` and `src/components/navigationConfig.js` now re-export from core (deprecated, kept for import compat). `components/Navigation.jsx` kept but flagged deprecated in favor of core.
- **App.jsx** breadcrumb now delegates to `getBreadcrumbCore(view)` (single source). Future: `NAV_SECTIONS` can be derived via `buildNavSections({badges})` for new views with one-line registration.
- **Invariant:** New module = one entry in `VIEWS` + one viewId in `NAVIGATION_CONFIG` or `VIEW_REGISTRY`; no edits in 3-4 files.

## 3. View Registry

- **File:** `src/core/viewRegistry.js` — `VIEW_REGISTRY` with { id, label, section, component (lazyWithRetry), breadcrumb, mobile, keywords, related }.
- App.jsx still uses inline `view===` switches (preserved for safety) but registry is now the reference for search, shortcuts, breadcrumbs, and future App.jsx refactor to render via registry loop.
- All 23 views registered; `dashboard/whiteboard/lessonplans/.../help` covered.

## 4. Event System

- **File:** `src/core/appEvents.js` — `AppEvents` enum (DATA_UPDATED, SETTINGS_UPDATED, NAVIGATE, BOOK_OPENED/UPDATED, SEARCH_UPDATED, INDEX_READY, SCAN_SAVED, LESSON_PLAN_UPDATED, ACTIVITY_UPDATED, QUESTION_UPDATED, WORKSHEET_UPDATED, WHITEBOARD_UPDATED, SEND_TO_WHITEBOARD, MISSIONS_UPDATED, WEBTOOLS_UPDATED, etc.) and `DataDomains`.
- `appEvents.emit/on/once/off`; `emitDataUpdated({domain,action,id})`; automatic window CustomEvent dispatch for legacy listeners; guard for Node/test env.
- `missionEvents`, `teachingDB`, `researchDB`, `aiDataStorage`, `whiteboardStore`, `settingsStore` now emit via `appEvents` (legacy window dispatch retained via bus).
- Dashboard/mission whiteboard/search listeners use typed events, selective refresh (only dependent domain).

## 5. Storage Architecture

```
App Storage
├── Settings (sgk_settings — canonical via settingsStore)
├── User Data (bookmarks/vocab/quiz/history/favs — LS)
├── Teaching (lessonPlans/activities/worksheets/questions/autosave — LS)
├── Research (clips/refs/concepts/evidence/collections/marks/notes — hybrid)
├── AI Data (ai_* — LS with LRU)
├── Whiteboard (sgk_wb_index/board_* — LS + image blobs IDB separate)
├── Scan (sgk_scans_v1 + scan_assets IDB)
├── Cache (sgk_idx_/sgk_idxmeta_/ocr_/txt_/lastPage_/lastTotal_/chat_ — rebuildable)
└── Book Data (per-book notes/marks/teacherNotes + search_index/ocr_cache IDB)
```

- **Files:** `src/core/storageKeys.js` (canonical BACKUP_KEYS/CACHE_PREFIXES + helpers `isBackupKey/isCacheKey/lastPageKey/wbBoardKey/...`), `src/core/storageAdapter.js` (domain contract `storage.get(domain,key)` etc).
- `storage.js` now delegates `isBackupKey/isCacheKey` to core; `settingsStore` delegates `isCacheKeyForSettings` to core.
- `storageAdapter` canonical map: clips/refs/concepts/evidence/scan/ocr/searchIndex → IDB canonical + LS fallback (merge read, write to IDB then sync LS); others → LS canonical.
- Components never need to know where data lives; `domainGet/Set/Remove/List` abstract it.

## 6. IndexedDB Strategy

- DB `SGKAppDB` v2, STORES: `ocr_cache`, `search_index`, `clips`, `refs`, `concepts`, `evidence`, `scan_assets` (7).
- **Canonical:** clips/refs/concepts/evidence/scan/ocr/searchIndex = IDB canonical, LS = legacy/fallback (gradual migration, fallback read).
- **Migration:** Legacy `ocr_*`/`sgk_idx_*` in LS are lazily merged; writes go to IDB and clear LS copy. `clearBookData` and `wipeAppData` now aware.
- **Gap closed (partial):** `whiteboard/imageStore` (`sgk_wb_images` blob DB) documented as isolated; full unification into STORES recommended as next debt item (still covered via `whiteboardStore` LS keys `sgk_wb_index/board_*`).
- Build: `indexedDB-CC5sZP6b.js` chunk, IDB available check guards for test env.

## 7. Settings Architecture

- Single source: `settingsStore.js` (`sgk_settings`, version 1, deepMerge + migration for appearance/behavior/reading).
- `DEFAULT_SETTINGS` covers appearance/theme/accent/density/radius/shadow/font/animation, reading/layout, editor, missions, ai, notifications, accessibility, export, backup, behavior/sound, search, library, whiteboard, advanced, keyboard.
- Change flow: `updateSettings(patch)` → `saveSettings` → `applySettings` (CSS vars) → `appEvents.emit(SETTINGS_UPDATED)` + `window sgk:settings-updated` (both).
- Theme/density/font/sound submodules subscribe via `appEvents.on(SETTINGS_UPDATED)` (App.jsx already does).
- No `moduleA_settings` duplicates; legacy `sgk_theme` mirrored via `safeSetString`.

## 8. Book Context

- **File:** `src/core/bookContext.js` — `BookContext` (React context) + `BookProvider` + `useBookContext` + `makeBookContext(book,page)` + `makeSourceRef(ctx)`.
- App.jsx now wraps `BookReader` in `<BookProvider book={currentBook} page={openInitialPage}>`; children can `useBookContext()` for `{filename,title,subject,grade,term,page,bookPage,chapter,citation}`.
- Service helper `makeSourceRef` standardizes `sourceRef: {filename,title,page,bookPage,chapter,citation,subject,grade}` used by whiteboard/clip/KHBD/AI.

## 9. Source/Citation Flow

`BOOK → PAGE → TEXT/OCR → sourceRef → NOTE/CLIP/CONCEPT/KHBD/WHITEBOARD/AI` with metadata preserved.
- `whiteboardStore.blankObject.sourceRef` + `citation` retained.
- `researchDB.getClips/refs/concepts` keep `file, page, citation`.
- `teachingDB` lessonPlan `metadata.bookReference` / `bookReferences[]` uses same shape; migration keeps both keys.
- `integration.fromBookToModule(book,page,text,target)` builds sourceRef automatically via `makeBookContext`.

## 10. Module Dependency Map

- `App` → `navigationRegistry/viewRegistry/appEvents/bookContext/storageKeys`
- `BookReader` → `bookContext/researchDB/searchIndex/whiteboardIntegration/appContext`
- `Teaching (teachingDB/khbd*)` → `storage/safeStorage/appEvents/missionEvents/bookContext`
- `Research (researchDB)` → `indexedDB/appEvents/tocData`
- `Whiteboard` → `whiteboardStore/mindmapEngine/imageStore/whiteboardIntegration/appEvents`
- `AI (aiService/aiDataStorage)` → `storageKeys/appEvents/appContext`
- `Missions` → `missionStore/missionEvents/appEvents/safeStorage`
- `Scan` → `scanStore/indexedDB/appEvents`
- `Search` → `searchIndex/GlobalSearch/navigationRegistry`

No circular hard imports; `window` events used only via `appEvents`.

## 11. Integration Map

Unified via `src/core/integration.js` — `integration.open({target,payload,source})`:

| Flow | Source → Target | Payload | Source |
|---|---|---|---|
| Book → Whiteboard | `fromBookToModule(book,page,text,"whiteboard")` | title,text,sourceRef,imageDataUrl | bookReader |
| Book → KHBD | `integration.open({target:"khbd", payload:{text,sourceRef}})` | sourceRef, selectedText | bookReader |
| Book → Search | `integration.open({target:"search", payload:{query}})` | query, sourceRef | bookReader |
| Book → Vocabulary | via `userdata` + `appEvents` | word, meaning, file page | bookReader |
| Search → BookReader | `appEvents.emit(OPEN_SOURCE,{filename,page})` | filename, page | search |
| KHBD → Activities/Worksheets/QuestionBank | domain service + `appEvents` | planId, activities | khbd |
| KHBD → Whiteboard | `fromKhbdToModule(plan,"whiteboard")` via mindmapEngine | branches | khbd |
| Whiteboard → KHBD/BookReader | `whiteboardIntegration.send*` + `integration` | board, sourceRef | whiteboard |
| AI → KHBD/Whiteboard/Activities/Questions | `buildAppContext` + `integration.open` | ctx, generated content | AI |
| Global | `appEvents.emit(NAVIGATE,{view})` | view | any |

All emit also dispatch legacy `sgk:send-to-whiteboard`, `sgk:navigate`, `sgk:open-source` for backward compat.

## 12. Data Migration

- `storage.migrateBookData(oldFilename,newFilename)` transactional (read old → create new → verify → cleanup old, rollback on fail) covers per-book prefixes, bookmarks, vocab, clips/refs/concepts, scans, lessonPlans, IDB OCR/searchIndex.
- Whiteboard `normalizeBoard` validates `objects/connectors` + cycle repair.
- `settingsStore.migrateAppearance/Behavior/Reading` normalizes legacy `sgk_theme` → `sgk_settings.appearance.theme`.
- No data loss: `backupCorrupted` keeps 5 copies of corrupted JSON; migration verifies before deleting old.

## 13. Data Integrity

- **File:** `src/dataIntegrity.js` extended: `checkOrphanData` (clips/refs/concepts/notes/marks/teacherNotes), `cleanupOrphanData`, `getStorageStats` (backup/cache breakdown), `validateBackupData` (schema+duplicate IDs), **`checkIntegrity(books)`** (orphan + storageStats + backupValidation + brokenWhiteboardRefs/brokenKhbdRefs/duplicateIds/invalidSourceRefs), **`repairIntegrity(books,{dryRun})`** (backup snapshot via `exportBackup`, orphan cleanup, sourceRef citation fix, `appEvents.DATA_UPDATED` emit).
- Delete Book cascade via `storage.removeBookData` covers LS per-book keys + IDB OCR/search/clips/refs/concepts/evidence/scan + lessonPlan missing mark.

## 14. Backup/Restore

- `storage.exportBackup/restoreIndexedDBData/importBackup/parseBackupPreview/wipeAppData` cover localStorage (BACKUP_KEYS) + IndexedDB (7 stores, getAllRecords).
- `importBackup` atomic via `saveBatch` snapshot; validates schemaVersion 1/2, clears snapshot-owned stores before restore, emits `sgk:data-updated`.
- Cache (`sgk_idx_/ocr_/txt_/lastPage_` etc) `isCacheKey` → not backed up, but wiped/cleared on demand.
- `whiteboard` boards + `ai_*` + `missions` + `scans` + `custom_titles` all in BACKUP_KEYS now.

## 15. Search Integration

- `searchIndex.buildIndex` builds per-book index (PDF or Word fetched via `/api/books/.../content`, chunked 3k, meta `total/textPages/ocrPages/imagePages`).
- `GlobalSearch.jsx` searches books + lessonPlans/activities/worksheets + concepts/refs/collections/whiteboards via `getWhiteboardIndex`, returns `type/title/description/source/book/page/action` with `normIncludes` (Vietnamese diacritic-insensitive) and click → `onNavigate`/`onOpenBook` via unified nav.
- `SearchView/CompareView/MatrixView/InventoryView/LangStatsView` read `sgk_idx_*` via `searchIndex` service.

## 16. AI Context

- **File:** `src/core/appContext.js` — `buildAppContext({book,page,view,lessonPlan,board,selectedText})` returns `{book,view,selectedText,lessonPlan,whiteboard,settings,at}`; `contextToPromptSuffix(ctx)` for prompt injection.
- Callers (BookReader, LessonPlansView, WhiteboardView, AssistantBubble) should pass `book/page/selectedText` so AI receives subject/grade/chapter/citation automatically (spec §19). `AssistantBubble` already receives `appContext` prop from App.

## 17. Whiteboard Integration

- Whiteboard is **integrated module**, not isolated: receives `text/image/citation/sourceRef` from BookReader/Scan/KHBD/AI via `whiteboardIntegration.sendToWhiteboard/sendBookSelectionToBoard/...` which dispatch `sgk:send-to-whiteboard` + `queuePendingPayload` + `sgk:navigate→whiteboard`.
- `WhiteboardView` listens `sgk:send-to-whiteboard`, `sgk:data-updated`, `storage`; emits `sgk:whiteboard-updated` (3×) now via `appEvents` (persistBoard/createBoard/deleteBoard).
- Can send back: `Whiteboard → BookReader/KHBD/AI` via `integration.open` + mindmapEngine (`lessonPlanToBoard`, `questionsToBoard`, `bookPageToBoard`).

## 18. Dashboard Integration

- Dashboard is control center: reads `books/history/bookmarks/vocab/lessonPlans/questions/clips/marks/whiteboard/missions/searchIndex` via domain services (not isolated).
- On `appEvents.DATA_UPDATED` dashboard refreshes relevant counters (no full reload); `App.jsx` totalXxx via `dataVersion` bump handles aggregates; `whiteboardCount/webToolsCount` listen `sgk:whiteboard-updated`, `sgk:webtools-updated`.
- `App.jsx` `dataVersion` pattern retained (+ unified bus).

## 19. Remaining Technical Debt — CLOSED (2026-09-13 Phase 7) + Phase 8 Cleanup

### Phase 7 (closed)
1. ✅ **wb_images merged:** `indexedDB.js` STORES now includes `WB_IMAGES='wb_images'`, DB_VERSION 3, `onupgradeneeded` creates store. `whiteboard/imageStore.js` now delegates to central `SGKAppDB` (`STORES.WB_IMAGES`) primary with legacy `SGKWhiteboardDB` fallback + one-time migration (`migrateLegacyIfNeeded`) + `clearAllImageBlobs`. `exportIndexedDBData`/`clearAllIndexedDBData` via `Object.values(STORES)` auto-covers wb_images backup/wipe.
2. ✅ **App.jsx NAV_SECTIONS unified:** Replaced 150-line inline `NAV_SECTIONS`/`FOOTER_NAV` with `useMemo(()=>buildNavSectionsCore({badges:{continue,marks,vocab,whiteboard,matrix,collections,webtools}}),[...])` and `getFooterNav()` (settings action injected). Icons via `React.createElement`. Single source now drives sidebar render.
3. ✅ **Navigation.jsx deprecated:** No imports found (`Get-ChildItem` search zero hits). File kept with `@deprecated` banner re-exporting core, safe to delete next major.
4. ✅ **syncService stays local:** Confirmed per spec “Không biến syncService thành cloud sync giả” — kept `LOCAL_SIMULATION`, not wired to network.
5. ✅ **ocr_/txt_ via unified helper:** `searchIndex.js` now uses `getOCR/setOCR` from `indexedDB.js` + `ocrKey` from `core/storageKeys.js` (no direct `localStorage.getItem('ocr_...')`). `indexedDB.getOCR/setOCR` use `_ocrKey` helper. `App.jsx`/`SettingsCenter.jsx` cache prefixes now via `STORAGE_KEYS.CACHE_PREFIXES` (imported). `SearchView` etc. route through `searchIndex`.
6. ✅ **stats vs langstats clarified:** `navigationRegistry.js` VIEW_ALIASES comment + aliases `bookmarks→marks`, `sync→datatools`; docs: `stats` = Thống kê cá nhân (CÔNG VIỆC), `langstats` = Thống kê ngôn ngữ (Công cụ nâng cao).
7. ✅ **AppErrorBoundary → toFriendlyError wired:** `App.jsx:10` imports `toFriendlyError`, `componentDidCatch` logs `[AppErrorBoundary:type]`, render shows `friendly.message/type/recoverable` + `clearCache` button when `action==='clearCache'`. `teachingDB.saveLessonPlan` deduped to `notifyDataUpdated`.

### Phase 8 (2026-09-13 — Final Integration Cleanup)
8. ✅ **Fake storage events eliminated:** 10/11 `new Event("storage")` removed (7 views loop + userdata/personalDB/App.jsx). Only `core/appEvents.js:109` bridge kept as single `window` bridge.
9. ✅ **`window.dispatchEvent` centralized:** 60→37 (-23). `safeStorage`, `settingsStore`, `whiteboardIntegration/Store`, `App.jsx` (index-ready/data-updated/open-global-search) migrated to `appEvents.emit`. Only `core/appEvents.js` is allowed to `window.dispatchEvent`.
10. ✅ **Direct localStorage migrated in Views:** `AssistantBubble(4)/BookReader(2)/StructuredNotes(2)/UtilityBubble(4)/searchIndex(1)` → `safeStorage` (`safeGetString/safeSetJSON/safeRemove`). Total `localStorage.*` 224→213. Remaining 106 in health-check/diagnostic/sync (documented debt).
11. ✅ **`normalizeSourceRef()` added:** `core/bookContext.js` now exports `normalizeSourceRef(input, fallbackBook)` + `isValidSourceRef` — canonical `{filename,title,page,bookPage,chapter,citation,subject,grade}` handles `bookId/file/fileName/book/source/pageNumber` etc. `whiteboardIntegration.sendBookSelectionToBoard` migrated to `makeBookContext/makeSourceRef`.
12. ✅ **LEGACY_DEPRECATION.md created:** 30 entries with A/B/C classification, replacement, and next-major actions (see `LEGACY_DEPRECATION.md`).
13. ✅ **Audit & Final Report:** `PHASE8_INTEGRATION_AUDIT.md` (117 violations detailed) + `PHASE8_FINAL_INTEGRATION_REPORT.md` (13% unified, 303 tests, 1703 modules).

## 20. Verification (Phase 8 — 2026-09-13)

- `npm run build`: ✓ **1703** modules, PWA **63** entries (**4055 KiB**), no build errors (Phase 8: appEvents/whiteboardIntegration/safeStorage/settingsStore/AssistantBubble/BookReader/StructuredNotes/UtilityBubble/searchIndex changes + bookContext normalizeSourceRef).
- `npm test`: **303 tests PASS (76 suites), 0 fail**. No `window.dispatchEvent is not a function` warnings (guarded appEvents + synthetic storage removed). Flows: `npm test` covers backup/restore/wipe/sync, KHBD CRUD, search normMap, scan pipeline, dataIntegrity.
- Manual flows (code inspection): A-G flows preserved (Library→BookReader→Bookmark/Vocab/Search→Dashboard; BookReader→Source→KHBD→Activity/Worksheet/Question→Whiteboard; etc.) all via unified contracts; no feature deleted, no schema broken, no cloud required, offline intact, circular deps none. Cross-module tests in `PHASE8_FINAL_INTEGRATION_REPORT.md §11`.
- Migration backward-compatible: `navigationConfig` re-exports, `storage.isBackupKey/isCacheKey` delegate, `appEvents` dispatches legacy window events (single bridge), `wb_images` migrates legacy DB silently, `normalizeSourceRef` keeps old `bookId/file` readable.

---
*All core modules are plain JS, no Redux/Zustand bloat, lazy-loaded, event-driven selective refresh, memoization preserved in App.jsx derived data.*
