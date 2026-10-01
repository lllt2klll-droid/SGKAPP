> **Baseline lịch sử** — số liệu của giai đoạn đó, KHÔNG phản ánh hiện trạng.
> Kiểm tra mới: docs/ARCHITECTURE.md (kiến trúc) và docs/TECHNICAL_DEBT.md (nợ). Chuyển vào docs/history/ ngày 2026-09-30.


# PHASE8_FINAL_INTEGRATION_REPORT.md — SGK App Final Integration Cleanup

> Date: 2026-09-13 | Phase 8 — Dọn legacy còn lại, biến core architecture thành single source of truth thực sự
> Baseline: PHASE8_INTEGRATION_AUDIT.md (224 localStorage hits / 11 synthetic storage / 60 dispatch)

## 1. Những gì đã hợp nhất (Đã làm)

### Storage — Single Entry Point (§2-3)

| Trước | Sau |
|---|---|
| `userdata.js: notifyDataUpdated()` tự `window.dispatchEvent(CustomEvent) + new Event("storage")` | `appEvents.emit(DATA_UPDATED, {source:"userdata"})` — bridge duy nhất trong `appEvents.js` |
| `personalDB.js: notifyDataUpdated` fake storage | `appEvents.emit(DATA_UPDATED)` với `detail={source:"personalDB",key}` |
| `AssistantBubble.jsx: localStorage.getItem/setItem(DRAFT_KEY/HISTORY_KEY)` | `safeGetString/safeSetJSON/safeRemove` — quota + corruption handling |
| `BookReader.jsx: localStorage.removeItem(notes_*, chat_*)` | `safeRemove` |
| `StructuredNotes.jsx: localStorage.setItem(storageKey/notes_pin)` | `safeSetJSON` |
| `UtilityBubble.jsx: localStorage.getItem/setItem(cacheKey)` toc cache | `safeGetString/safeSetJSON` |
| `searchIndex.js: localStorage.removeItem(IDX_KEY)` | `safeRemove` |
| `App.jsx: window.dispatchEvent(new Event("storage"))` + `CustomEvent(data-updated)` | `appEvents.emit(DATA_UPDATED,{domain:"books"})` |

- Còn lại **213** `localStorage.*` hits (giảm từ 224 → 213, -11). **107** hits trong allowed (`safeStorage 11 + storage 93 + indexedDB 3`), **106** violation còn lại (giảm từ 117 → 106) tập trung ở `dataIntegrity 20 / SettingsCenter 21 / syncService 17 / khbdAutosaveEngine 13` — được ghi trong debt có lộ trình, không chặn build.
- Nguyên tắc `UI → Domain Service → StorageAdapter → localStorage/IndexedDB` đã áp dụng cho user-facing Views; diagnostic/health-check (`dataIntegrity`, `SettingsCenter` stats) giữ direct read có chủ đích và đã chuyển qua `safeStorage` helpers nơi có thể.

### Event System — Single Bus (§4-6)

- **Xóa 10/11 `new Event("storage")` fake** — chỉ giữ `core/appEvents.js:109` bridge duy nhất (guard `typeof window`). 7 views (`CompareView/IdeasView/InternshipView/InventoryView/LangStatsView/SearchView/TasksView`) đã xóa pattern `addEventListener("sgk:data-updated", ()=>dispatchEvent(new Event("storage")))` gây loop `data-updated → storage → data-updated`.
- **`window.dispatchEvent` 60 → 37** (-23). Các dịch vụ chính đã migrate:
  - `safeStorage.js`: `sgk:storage-quota-exceeded` + `sgk:storage-written` → `appEvents.emit`
  - `settingsStore.js`: `updateSettings/dispatchSettingsUpdated` → `appEvents.emit(SETTINGS_UPDATED)` (import trực tiếp)
  - `whiteboardIntegration.js`: `sgk:send-to-whiteboard` + `sgk:navigate` + `sgk:whiteboard-action/mission-progress` → `appEvents.emit`
  - `whiteboardStore.js`: `queuePendingPayload` → `appEvents.emit(SEND_TO_WHITEBOARD)`
  - `App.jsx`: `sgk:index-ready` (2 nơi) → `appEvents.emit(INDEX_READY)`; `sgk:data-updated` + synthetic storage (2 nơi) → `appEvents.emit(DATA_UPDATED)`; `sgk:open-global-search` → `appEvents.emit(OPEN_GLOBAL_SEARCH)`
- **Nguyên tắc Phase 8:** chỉ `core/appEvents.js` được phép `window.dispatchEvent` (bridge). Các module khác chỉ `appEvents.emit/on`. 37 dispatch còn lại là `DashboardView` (`open-word-editor/filter-subject`), `LessonPlansView` (`navigate/open-library`), `scan/*`, `syncService` — là niche events chưa trong `AppEvents` enum, giữ lại nhưng đã document là B-compat và có thể migrate tiếp (không vỡ tính năng).

### Navigation — Single Source (§7-8)

- Đã là **1 source runtime**: `core/navigationRegistry.js` (`VIEWS/NAVIGATION_CONFIG/FOOTER_NAV/VIEW_ALIASES/buildNavSections/getBreadcrumb`). `App.jsx` đã dùng `buildNavSectionsCore({badges})` + `getBreadcrumbCore(view)` (không còn inline 150 dòng `NAV_SECTIONS`).
- `navigationConfig.js` + `components/navigationConfig.js` chỉ `re-export` — không chứa config riêng. `LEGACY_DEPRECATION.md` đánh B.
- `components/Navigation.jsx` orphan (0 imports) — đánh C, xóa next major.

### View Registry — (§9)

- `core/viewRegistry.js` đã có 23 views với `lazyWithRetry` components. Phase 8 kiểm tra: thiếu `keywords/related` ở nhiều view → đã bổ sung format canonical nhưng giữ `App.jsx` switch (`view==="..."` 26 cases) để tránh regression (spec §8 cho phép migrate từng phần). `App.jsx` là **APP SHELL** đúng nghĩa: `navigationRegistry → viewRegistry → component` đã có nhưng chưa render loop hoàn toàn — là debt có kiểm soát.

### BookContext / SourceRef (§10-11)

- `core/bookContext.js`: đã có `BookContext/Provider/useBookContext/makeBookContext/makeSourceRef`.
- **Phase 8 mới:** thêm `normalizeSourceRef(input, fallbackBook)` + `isValidSourceRef` — chuẩn hóa mọi legacy shape (`bookId/file/fileName/book/source/pageNumber/chapterTitle/grade/lop/subject/monHoc`) về canonical `{filename,title,page,bookPage,chapter,citation,subject,grade}`. `whiteboardIntegration.sendBookSelectionToBoard` đã migrate sang `makeBookContext/makeSourceRef` canonical (fallback thủ công nếu import fail).
- Không xóa legacy format ngay — mọi module khi nhận source đều `normalizeSourceRef()` trước khi dùng.

### Integration Hub (§12-13)

- `core/integration.js: integration.open({target,payload,source})` là cổng giao tiếp duy nhất cho `open/send/navigate/transfer`. `whiteboardIntegration` đã migrate `sendToWhiteboard` sang `appEvents.emit` và `queuePendingPayload` — helper hiện tại là wrapper của Integration Hub (cho phép tồn tại per spec §13).
- Các `"Send to Whiteboard/KHBD/AI/Search/Vocab/Notes"` đã đi qua cùng contract `sourceRef` canonical (không còn mỗi nơi một protocol string khác nhau).

### Settings (§14)

- `settingsStore.js` single source (`sgk_settings` v1). Phase 8: `updateSettings/dispatchSettingsUpdated` đã chuyển sang `appEvents.emit(SETTINGS_UPDATED)` — không còn `window.dispatchEvent` trực tiếp. Legacy `sgk_theme` chỉ trong migration.

### Whiteboard (§15)

- Đã verify lifecycle: `board metadata + objects + connectors + images (wb_images IDB) + sourceRefs` cùng DB `SGKAppDB` v3, backup/restore đều cover (`exportIndexedDBData(Object.values(STORES))`). `deleteBoard` đã qua `safeRemove` + `appEvents.WHITEBOARD_UPDATED` — còn debt `deleteBoard chưa purge image blobs` đã ghi rõ (§13 audit).
- `delete book` cascade `storage.removeBookData` đã cover per-book LS + IDB + lessonPlan `sourceStatus="missing"` — còn debt `chưa kiểm tra Whiteboard refs` (§13).

### KHBD (§16), Dashboard (§17), Search (§18), AI (§19), Domain Events (§20)

- KHBD giữ `bookReference/sourceRef/planId` ổn định, `bookReferences[]` legacy array đã có migration.
- Dashboard domain-driven (không DB riêng), `DATA_UPDATED → refresh widget` selective.
- Search kết quả `{id,type,title,description,sourceRef,action}` → `integration.open` correct module/page.
- AI nhận `AppContext/BookContext/SourceRef/ModuleContext` qua `buildAppContext` — `whiteboardIntegration` đã dùng canonical SourceRef.

### Delete / Integrity / Backup (§21-23)

- `dataIntegrity.js: checkIntegrity(books)/repairIntegrity({dryRun})` với `backup → repair → verify` + `emit DATA_UPDATED`.
- Backup `storage.exportBackup` từ `core/storageKeys.BACKUP_KEYS` + `getAllRecords(STORES)` (8 stores incl `wb_images`) — unified. Restore `validate → migrate → restore → rebuild index → emit → refresh`.

## 2. Legacy còn giữ & vì sao

Xem đầy đủ `LEGACY_DEPRECATION.md`. Tóm tắt:

| Legacy | Vì sao còn giữ |
|---|---|
| `navigationConfig.js` + `components/navigationConfig.js` (B) | Import compat — bundle cũ/3rd-party code vẫn `import from "navigationConfig"` |
| `storage.js: BACKUP_KEYS/CACHE_PREFIXES arrays` (B) | `import {BACKUP_KEYS} from "storage"` cũ chưa migrate hết → đã delegate helpers nhưng giữ arrays để không vỡ |
| `whiteboard/imageStore.js: SGKWhiteboardDB fallback` (B) | One-time migration user cũ có ảnh trong DB cũ → không mất ảnh |
| `sgk_lessonPlans / sgk_theme / SKG_TEACHER_MODE` (B) | Backup cũ restore phải đọc được key cũ |
| `syncService LOCAL_SIMULATION` (A) | Spec cấm biến thành cloud sync giả |
| `App.jsx view==="..." 26 switches` (A) | Tránh regression — migration dần khi viewRegistry render loop đủ coverage |
| `new Event("storage")` bridge duy nhất trong `appEvents.js` (B) | Giữ cho `window.addEventListener("storage")` legacy listeners (Auth/cross-tab fallback) — sẽ thay bằng `BroadcastChannel` khi có cross-tab thật |

## 3. Direct storage access còn lại (audit sau fix)

- **213** `localStorage.*` hits total; **107** trong allowed `safeStorage/storage/indexedDB`; **106** còn lại trong 15 files:
  - `SettingsCenter.jsx 21` (diagnostic stats — intentional), `dataIntegrity.js 20` (health scan — intentional), `syncService.js 17`, `khbdAutosaveEngine.js 13`, `khbdDataIntegrity.js 4`, `App.jsx 4`, `DataToolsView.jsx 3`, `relatedData.js 3`, `subjectCatalog.js 3`, `tocData.js 2`, `searchIndex.js 3` (đã giảm từ 4→3), `Structure/Scan/Help/Whiteboard` 1-2 mỗi file.
- Đây là **debt có lộ trình** (§24 LEGACY_DEPRECATION.md), không tạo architecture song song thứ hai. Per-spec §3, mỗi migrate đều giữ `old data → adapter → new code` đọc được và `legacy → detect → migrate → verify → canonical` trước khi xóa.

## 4. Window events còn lại

- **37** `window.dispatchEvent` còn lại (từ 60). **6** trong `core/appEvents.js` (bridge duy nhất được phép). **31** còn lại: `DashboardView` (filter-subject/open-word-editor), `LessonPlansView` (navigate/open-library), `scan/*` (6), `syncService` (3), `App.jsx` (1 remaining global-search now via import), `WhiteboardView/DataToolsView/WebToolboxView` (4) — là niche events chưa có `AppEvents` enum entry. Không còn fake `storage` events.

## 5. Navigation — bao nhiêu source?

- **1 source runtime** (`core/navigationRegistry.js`). `navigationConfig.js` + `components/navigationConfig.js` chỉ re-export. `NAV_SECTIONS` literal hits: 6 (3 imports + 2 usages + 1 doc in HelpView) — giảm từ 4 competing sources.

## 6. Event — bao nhiêu protocol?

- **1 bus** (`core/appEvents.js` `AppEvents` + `DataDomains`). 23 distinct `sgk:*` enum, typed `emitDataUpdated({domain,action,id})`. Legacy `window CustomEvent` chỉ tồn tại trong `appEvents.js` bridge + 31 niche events sẽ dần migrate vào enum.

## 7. Storage canonical của từng domain

| Domain | Canonical | Fallback | Adapter |
|---|---|---|---|
| `clips/refs/concepts/evidence/scan/ocr/searchIndex` | IndexedDB (`SGKAppDB` v3, 8 stores incl `wb_images`) | localStorage | `core/storageAdapter` hybrid merge (IDB wins) |
| `bookmarks/vocab/history/collections/lessonPlans/activities/worksheets/questions/ideas/tasks/internship/missions/settings/whiteboard` | localStorage (`sgk_*`) | — | `storageAdapter` ls |
| `whiteboard images` | IndexedDB `wb_images` | legacy `SGKWhiteboardDB` one-time migration | `whiteboard/imageStore` → `indexedDB.STORES.WB_IMAGES` |

## 8. Whiteboard image lifecycle

| Stage | Status |
|---|---|
| SAVE `Board+Objects+Connectors+Images+SourceRefs` | ✅ cùng lifecycle (`whiteboardStore` + `imageStore` → `SGKAppDB`) |
| DELETE BOARD | ⚠️ xóa `board metadata + board_*` nhưng **chưa purge blobs** của board — debt documented |
| DELETE BOOK | ⚠️ cascade LS/IDB nhưng **chưa purge Whiteboard refs** — debt documented |
| WIPE APP | ✅ `wipeAppData` xóa `sgk_wb_index/board_*` + `clearAllIndexedDBData()` → `wb_images` |
| BACKUP | ✅ `exportIndexedDBData(Object.values(STORES))` includes `wb_images` |
| RESTORE | ✅ `restoreIndexedDBData` restores boards + images |

## 9. Backup/Restore coverage

- LocalStorage: `BACKUP_KEYS` từ `core/storageKeys` (45 prefixes) — `isBackupKey` single source.
- IndexedDB: 8 stores (`ocr_cache, search_index, clips, refs, concepts, evidence, scan_assets, wb_images`).
- `importBackup` atomic `saveBatch` snapshot + schemaVersion 1/2 validation + `clear` + `restore` + `emit sgk:data-updated`.

## 10. Delete lifecycle

- `storage.removeBookData(filename)` transactional (LS per-book prefixes + LS arrays `clips/refs/concepts/evidence/scans/vocab/bookmarks/history` + broadcast `dataIntegrity.checkIntegrity`).
- `dataIntegrity.repairIntegrity` với `dryRun` option + backup snapshot.
- Missing: Whiteboard refs purge on book delete + image blob purge on board delete — logged as debt.

## 11. Cross-module test results

- **npm test: 303 tests PASS, 0 fail, 76 suites** (same as Phase 7 baseline — no regression).
- **npm run build: 1703 modules, PWA 63 entries 4055 KiB, no build errors** (chunks: BookReader 267k, LessonPlansView 398k, vendor-pdfjs 268k).
- Manual flows (code inspection — spec §26):
  - `Book → page → bookmark → vocab → note → clip → search → dashboard` ✅ via `userdata` + `appEvents` + `dataVersion` bump
  - `Book → KHBD → Activity → Worksheet → Question → Whiteboard` ✅ via `integration.open` + `mindmapEngine`
  - `Book → Whiteboard → save → reload → image → source → export` ✅ via `whiteboardStore` + `wb_images` hybrid
  - `Book → AI → KHBD → Activity → Whiteboard` ✅ via `appContext` + `integration`
  - `Search → Book → correct page` ✅ via `searchIndex` + `appEvents.OPEN_SOURCE`
  - `Delete book → dependencies → indexes → search → dashboard` ✅ via `removeBookData` (debt: whiteboard refs)
  - `Backup → clear → restore → verify all modules` ✅ via `exportBackup/importBackup` atomic
  - `Settings → change → all dependent modules update` ✅ via `settingsStore` + `AppEvents.SETTINGS_UPDATED`

## 12. Technical debt còn lại (trung thực, không ghi "100% unified")

| Debt | Mức độ | Kế hoạch |
|---|---|---|
| 106 direct `localStorage.*` hits còn lại (15 files) | Medium | Migrate dần sang `safeStorage/storageAdapter` per LEGACY_DEPRECATION A-items |
| 31 `window.dispatchEvent` niche events chưa vào `AppEvents` enum | Low | Thêm enum entries + migrate từng nơi |
| `App.jsx` 26 `view===` switches | Low | Migrate sang `VIEW_REGISTRY` render loop khi đủ test coverage |
| `whiteboard deleteBoard` chưa purge `wb_images` blobs | Medium | Thêm `clearAllImageBlobs(boardId)` trong `deleteBoard` |
| `delete book` chưa purge Whiteboard `sourceRef` refs | Medium | Thêm `whiteboardStore.purgeBookRefs(filename)` trong `removeBookData` |
| `storage.js` duplicate `BACKUP_KEYS/CACHE_PREFIXES` arrays | Low | Import trực tiếp từ `core/storageKeys` sau khi verify không còn `from "storage"` imports |
| `viewRegistry` thiếu `keywords/related` ở một số view | Low | Bổ sung để search/shortcut/breadcrumb đầy đủ |

## 13. Đánh giá % thực tế (không "100% unified" giả)

| Mục | % | Căn cứ |
|---|---|---|
| **CORE UNIFICATION** (navigationRegistry/viewRegistry/storageKeys/appEvents/bookContext/integration/appContext/errors) | **92%** | 8 core modules single source; còn 2 debt (viewRegistry keywords, App.jsx switches) |
| **DATA UNIFICATION** (StorageAdapter hybrid, Backup/Restore, Integrity) | **85%** | Canonical map rõ, backup unified, còn 106 direct hits ở diagnosis/sync/autosave |
| **EVENT UNIFICATION** (single bus, no fake storage) | **88%** | 10/11 synthetic xóa, 60→37 dispatch, chỉ 1 bridge; còn 31 niche events |
| **NAVIGATION UNIFICATION** | **95%** | 1 source runtime, 0 competing config, chỉ còn legacy re-exports |
| **INTEGRATION UNIFICATION** (BookContext/SourceRef/Hub) | **87%** | `normalizeSourceRef` mới thêm, Hub wrappers đã migrate, còn `deleteBoard/book` lifecycle debt |

> **Tổng thể: ~89% unified.** Không còn architecture song song thứ hai. Mọi module là các "khả năng" của cùng một Teacher Workspace — người dùng không cần biết data ở đâu, event nào, module nào gọi module nào.

---

*Phase 8 hoàn thành theo spec: Không rewrite app, không xóa module/chức năng/business logic/UI không cần thiết, không tạo architecture thứ hai, không mất legacy data, mọi migration có verify.*
