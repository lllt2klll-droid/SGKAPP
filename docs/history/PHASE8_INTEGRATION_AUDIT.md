> **Baseline lịch sử** — số liệu của giai đoạn đó, KHÔNG phản ánh hiện trạng.
> Kiểm tra mới: docs/ARCHITECTURE.md (kiến trúc) và docs/TECHNICAL_DEBT.md (nợ). Chuyển vào docs/history/ ngày 2026-09-30.


# PHASE8_INTEGRATION_AUDIT.md — SGK App Final Integration Audit (2026-09-13)

> Quét toàn bộ `src/` trước khi sửa Phase 8. Thống kê chính xác (grep `Select-String` ngoại trừ `*.test.js / *.spec.js`).

## 0. Phương pháp
- Công cụ: PowerShell `Select-String` + `Get-ChildItem -Recurse` trên `src/**/*.js,*.jsx`
- Loại trừ: `*.test.js`, `*.spec.js` (test/migration được phép direct storage)
- Ngoại lệ hợp lệ (được phép direct storage): `core/storageAdapter.js`, `safeStorage.js`, `storage.js`, `indexedDB.js`

---

## 1. Tổng quan

| Hạng mục | Count | Ghi chú |
|---|---|---|
| `localStorage.*` hits (non-test) | **224** | 107 allowed (safeStorage 11 + storage 93 + indexedDB 3), **117 còn lại là violation** |
| `new Event("storage")` synthetic | **11** | Anti-pattern trong cùng tab |
| `window.dispatchEvent` | **60** | Phân tán 30 files |
| `CustomEvent` constructors | **49** | 23 distinct `sgk:*` + 5 system |
| `NAV_SECTIONS` occurrences | **6** | Đã giảm từ 4 nguồn → 1 source nhưng còn 6 literal references |
| `view === "..."` hard-coded switches | **28** | App.jsx 26 + DashboardView 1 + whiteboardIntegration 1 |
| Hard-coded `"sgk_*"` string literals | **333** | 45 domain keys * lặp lại |
| `sgk:data-updated` dispatches | **52** | catch-all, lắng nghe 20+ nơi |

## 2. Direct localStorage — chi tiết per-file (non-test, non-allowed-candidates)

| File | Hits | Allowed? | Phân loại |
|---|---|---|---|
| `src/safeStorage.js` | 11 | ✅ allowed | Low-level adapter |
| `src/storage.js` | 93 | ✅ allowed | Legacy unified (delegate to core) |
| `src/indexedDB.js` | 3 | ✅ allowed | OCR fallback (`_ocrKey`) |
| `src/dataIntegrity.js` | **20** | ❌ violation | Health check center — nên qua `storageAdapter`/`safeStorage` |
| `src/SettingsCenter.jsx` | **21** | ❌ violation | Diagnostic panel read direct, wipe direct |
| `src/syncService.js` | **17** | ❌ violation | LC simulation — nên qua adapter |
| `src/khbdAutosaveEngine.js` | **13** | ❌ violation | Autosave per-plan — nên qua domain service |
| `src/App.jsx` | **4** | ❌ violation | `LS.lastPage/lastTotal`, cache clear `localStorage.removeItem` |
| `src/AssistantBubble.jsx` | **4** | ❌ violation | `DRAFT_KEY/HISTORY_KEY` draft |
| `src/UtilityBubble.jsx` | **4** | ❌ violation | `cacheKey` search cache |
| `src/StructuredNotes.jsx` | **4** | ❌ violation | `notes_<file>_*` per-page notes |
| `src/khbdDataIntegrity.js` | **4** | ❌ violation | Khbd orphan autosave |
| `src/relatedData.js` | **3** | ❌ violation | `sgk_related_links` |
| `src/searchIndex.js` | **3** | ❌ violation | Legacy `localStorage.removeItem(IDX_KEY)` (còn sót) |
| `src/subjectCatalog.js` | **3** | ❌ violation | `CATALOG_KEY` |
| `src/DataToolsView.jsx` | **3** | ❌ violation | `bytes = localStorage.getItem(key).length` (debug) |
| `src/BookReader.jsx` | **2** | ❌ violation | `notes_<file>_<page>`, `chat_<file>` |
| `src/whiteboard/WhiteboardView.jsx` | **2** | ❌ violation | Image blob metadata debug |
| `src/tocData.js` | **2** | ❌ violation | `CUSTOM_TOC_KEY` |
| `src/scan/scanAIService.js` | **1** | ❌ violation | Scan cache |
| `src/HelpView.jsx` | **1** | ❌ violation | Diagnostic read |
| **Tổng violation** | **117** | — | 17 files cần migrate |

> Test files có thêm ~68 hits trong `*.test.js` (migration/rollback tests) — giữ nguyên, không tính violation.

**Kết luận §2:** Storage vẫn chưa single entry point. 52% hits đã qua adapter, 48% còn direct. View tự thao tác storage (§2 spec) vẫn xảy ra ở AssistantBubble, StructuredNotes, UtilityBubble, BookReader, SettingsCenter.

## 3. Direct IndexedDB (non-storageAdapter)

- Chỉ `src/indexedDB.js` + `src/storage.js` + `src/core/storageAdapter.js` được phép. Không phát hiện `indexedDB.open` trực tiếp ngoài `indexedDB.js` và `whiteboard/imageStore.js`.
- `whiteboard/imageStore.js` đã migrate sang `SGKAppDB/STORES.WB_IMAGES` (Phase 7) — còn legacy fallback `SGKWhiteboardDB` trong `whiteboard/imageStore.js: migrateLegacyIfNeeded()` — giữ lại cho migration, không tính violation.

## 4. Event System — Single Bus

### 4.1 `new Event("storage")` — 11 vị trí (PHẢI XÓA)

| File | Dòng | Ngữ cảnh |
|---|---|---|
| `src/core/appEvents.js:109` | `window.dispatchEvent(new Event("storage"))` | **Bridge duy nhất được phép** — giữ, nhưng cần guard anti-loop |
| `src/App.jsx:1374` | `window.dispatchEvent(new Event("storage"))` | Fake cross-module update |
| `src/personalDB.js:5` | `window.dispatchEvent(new Event("storage"))` | Fake |
| `src/userdata.js:42` | `window.dispatchEvent(new Event("storage"))` | Fake |
| `src/CompareView.jsx:119` | `window.dispatchEvent(new Event("storage"))` | Loop: `on sgk:data-updated → dispatch storage` |
| `src/IdeasView.jsx:20` | idem | Loop |
| `src/InternshipView.jsx:37` | idem | Loop |
| `src/InventoryView.jsx:19` | idem | Loop |
| `src/LangStatsView.jsx:21` | idem | Loop |
| `src/SearchView.jsx:47` | idem | Loop |
| `src/TasksView.jsx:21` | idem | Loop |

> 10/11 là fake same-tab notification. Chỉ `appEvents.js` được phép bridge. 7 views dùng pattern `addEventListener("sgk:data-updated", () => dispatchEvent(new Event("storage")))` tạo vòng lặp `data-updated → storage → data-updated`.

### 4.2 `window.dispatchEvent` — 60 hits (30 files)

Phân loại:
- **Core bridge (giữ):** `core/appEvents.js: 6` (emit + legacy alias + storage bridge) — SINGLE nơi được phép giao tiếp với `window` events sau Phase 8
- **Legit domain emit (migrate qua appEvents):** `safeStorage.js 2`, `settingsStore.js 2`, `storage.js 1`, `syncService.js 3`, `whiteboardStore.js 2 + whiteboardIntegration.js 4`, `BookReader.jsx 1`, `DataToolsView.jsx 1`, `personalDB.js 2`, `userdata.js 2`, `WhiteboardView.jsx 4`, `App.jsx 6`, `DashboardView.jsx 3`, `LessonPlansView.jsx 2`, `scan/* 7`, `WebToolboxView.jsx 1`, `SettingsCenter.jsx 1`
- **Anti-pattern (xóa):** 7 views kể trên + `App.jsx:930/954` `sgk:index-ready` (nên qua `appEvents.emit(AppEvents.INDEX_READY)`)

### 4.3 `CustomEvent` — 49 constructors

- 23 distinct `sgk:*` đã được registry trong `AppEvents` — không còn ad-hoc string mới.
- Còn sót direct `new CustomEvent("sgk:xxx")` trong 18 files thay vì `appEvents.emit(AppEvents.XXX)`. Cần migrate để lọc `DataDomains` đúng contract `emitDataUpdated({domain,action,id})`.

### 4.4 Duplicate event names
- `sgk:data-updated` được dispatch **52 lần** (nhiều nhất) nhưng chỉ nên là 1 bus với `{domain,action,id}`. Hiện các domain `lessonPlans/whiteboard/scan/webtools` đã có event riêng (`LESSON_PLAN_UPDATED` etc.) nhưng vẫn bắn thêm `DATA_UPDATED` catch-all — giữ backward-compat qua bus, không duplicate string mới.

## 5. NAV_SECTIONS / Navigation duplicate

| Source | Status |
|---|---|
| `src/core/navigationRegistry.js` | ✅ SINGLE SOURCE OF TRUTH (VIEWS, NAVIGATION_CONFIG, FOOTER_NAV, buildNavSections, getBreadcrumb, VIEW_ALIASES) |
| `src/navigationConfig.js` | ✅ Re-export only (7 lines) |
| `src/components/navigationConfig.js` | ✅ Re-export only (19 lines, derive RESEARCH_SUB_ITEMS from core) |
| `src/App.jsx:1491` | ✅ Đã migrate `const NAV_SECTIONS = useMemo(()=>buildNavSectionsCore({badges}),[...])` — không còn inline 150 dòng |
| `src/HelpView.jsx:78` | ⚠️ Chứa literal list khớp NAV_SECTIONS (documentation) — không duplicate runtime |
| `src/components/Navigation.jsx` | ⚠️ File tồn tại nhưng **0 imports** (orphan, flagged deprecated) — xóa ở major tiếp theo |

**Kết luận:** Navigation = 1 source runtime. 6 grep hits còn lại là import + usage, không còn config song song.

## 6. Inline view switch / hard-coded view IDs

- `view === "..."` **28 occurrences**:
  - `App.jsx: 26` — inline `if (view==="dashboard") render` + `getBreadcrumb(view)` + `handleNavigate` switches. Đã có `VIEW_REGISTRY` nhưng App.jsx vẫn dùng switch để tránh regression (spec §8 cho phép migrate từng phần).
  - `DashboardView.jsx:1`, `whiteboardIntegration.js:1` — legit.
  - `VIEW_REGISTRY` đã có `id,label,component,section,breadcrumb,mobile,keywords,related` cho 23 views — nhưng App.jsx chưa render qua `registry loop`. Migrate an toàn từng phần là debt còn lại.
- Hard-coded `"sgk_*"` **333** — chủ yếu trong `storage.js/BACKUP_KEYS` + `storageKeys.js/STORAGE_KEYS` (canonical) + violation files lặp chuỗi. Core đã single source, các file violation lặp string thay vì `import {STORAGE_KEYS}`.

## 7. Hard-coded storage keys

- Canonical: `src/core/storageKeys.js` (`STORAGE_KEYS`, `BACKUP_KEYS`, `CACHE_PREFIXES`, helpers `isBackupKey/isCacheKey/lastPageKey/wbBoardKey/...`)
- `src/storage.js` đã delegate `isBackupKey/isCacheKey` về core — còn giữ `BACKUP_KEYS` array duplicate (đồng bộ thủ công) và `CACHE_PREFIXES` local array (delegate nhưng vẫn định nghĩa). Debt nhẹ.
- Violation files dùng string literal `"sgk_wb_index"` thay vì `STORAGE_KEYS.WB_INDEX` — cần migrate import.

## 8. Duplicate navigation / settings

- Settings: `settingsStore.js` là single source (`sgk_settings` v1, `updateSettings→save→apply→emit SETTINGS_UPDATED`). Không phát hiện `component→localStorage sgk_settings` direct ngoài `safeStorage`/`storage`. Legacy `sgk_theme` chỉ trong `settingsStore.migrateAppearance` — OK.
- Dashboard: query domain services (`books/history/bookmarks/vocab/lessonPlans/questions/clips/marks/whiteboard/missions/searchIndex`) — không có isolated DB, chỉ `dataVersion` bump qua `DATA_UPDATED` selective refresh — OK.
- Duplicate settings: `sgk_sidebar_collapsed/w` + `sgk_expanded_sections` — quản lý bởi App.jsx via `safeGetJSON/safeSetJSON` (có thể đưa vào `settingsStore` nhưng hiện không duplicate).

## 9. Direct module-to-module imports (integration bypass)

- `BookReader.jsx → whiteboardIntegration.sendToWhiteboard` (dynamic import) — đi qua Integration Hub helper, không gọi Whiteboard internal function trực tiếp — **OK**.
- `KHBD → Whiteboard` via `mindmapEngine` + `whiteboardIntegration` — thông qua hub — OK.
- Không phát hiện `import WhiteboardView` trong BookReader hay `import KHBD` trong AI ngoài `integration.open` contract.
- Số lượng `integration.open` còn ít (chỉ `core/integration.js` + `whiteboardIntegration` dùng window events thay vì `integration.open`). Cần chuẩn hóa "Send to ..." qua `integration.open({target,payload,source})`.

## 10. Legacy compatibility code

| File | Purpose | Replacement | Status |
|---|---|---|---|
| `src/navigationConfig.js` | Re-export NAVIGATION_CONFIG/VIEWS | `core/navigationRegistry.js` | B — compatibility only |
| `src/components/navigationConfig.js` | Re-export + RESEARCH_SUB_ITEMS | `core/navigationRegistry.js` | B — compatibility only |
| `src/components/Navigation.jsx` | Orphan sidebar (4 groups) | `core/navigationRegistry.buildNavSections` | C — dead (0 imports) |
| `src/storage.js: isBackupKey/isCacheKey` | Duplicate helpers | `core/storageKeys.isBackupKey/isCacheKey` | B — delegate, giữ array cũ |
| `src/safeStorage.js` window dispatch | `sgk:storage-quota-exceeded` | `core/appEvents.STORAGE_QUOTA_EXCEEDED` | A — còn dùng, migrate dần |
| `src/khbdDomain.js` (nếu còn) | Domain shim | `core/storageKeys` | B |
| `whiteboard/imageStore.js` legacy DB | `SGKWhiteboardDB` fallback | `SGKAppDB.STORES.WB_IMAGES` | B — migration one-time |
| `sgk_lessonPlans` vs `sgk_lessonplans` | Typo legacy key | `STORAGE_KEYS.LESSON_PLANS_LEGACY` | B — keep 1 release |
| `SKG_TEACHER_MODE` typo | Wipe compat | — | B — keep in wipe list |

## 11. Orphan services / duplicate helpers

- `duplicate helpers: readJSON/saveJSON/getList` — tồn tại trong `storage.js`, `userdata.js`, `teachingDB.js`, `researchDB.js`, `aiDataStorage.js`, `safeStorage.js` — mỗi module tự định nghĩa wrapper quanh `safeStorage`. Không tạo architecture song song, chỉ duplicate nhẹ — đã chuẩn hóa qua `safeStorage.safeGetJSON/safeSetJSON` + `core/storageAdapter.domainGet/Set`.
- Orphan DB: `whiteboard/imageStore.js` isolated DB đã merged (Phase 7) — không còn orphan.
- `missionStore/missionEvents` — active, không orphan.
- `syncService.js` — kept `LOCAL_SIMULATION` per spec "Không biến syncService thành cloud sync giả" — không orphan, không mở rộng.

## 12. SourceRef / BookContext chuẩn hóa

- Canonical: `src/core/bookContext.js` — `BookContext`, `BookProvider`, `makeBookContext(book,page)`, `makeSourceRef(ctx)` → `{filename,title,page,bookPage,chapter,citation,subject,grade}`.
- Violation: `whiteboardIntegration.js:59-68` tự dựng `sourceRef` thủ công (filename/title/page/bookPage/chapter/citation/subject/grade) — đúng shape nhưng không qua `makeSourceRef`, không dùng `makeBookContext` — cần normalize.
- Legacy formats còn trong LS: `bookId/file/fileName/book/source/pageNumber` — chưa có `normalizeSourceRef()` central. `storage.migrateBookData` đã migrate `bookId→filename/file` nhưng runtime readers chưa normalize — cần thêm helper.

## 13. Whiteboard lifecycle (spec §15)

- SAVE: `whiteboardStore` (`sgk_wb_index/board_*`) + `imageStore` (`wb_images` IDB) — đã cùng DB `SGKAppDB` v3, `exportIndexedDBData(Object.values(STORES))` auto backup cả images — OK.
- DELETE BOARD: `whiteboardStore.deleteBoard` xóa `board metadata + board_*` nhưng **chưa xóa image blobs** của board đó — debt (images còn lại orphan).
- DELETE BOOK: `storage.removeBookData` xóa LS/IDB clips/refs/concepts/evidence/scan/lessonPlans/marks/notes/vocab/bookmarks — **chưa kiểm tra Whiteboard references** (`sourceRef.filename` orphan) — debt.
- WIPE APP: `storage.wipeAppData` xóa LS `sgk_wb_index/board_*` + `clearAllIndexedDBData()` xóa `wb_images` — OK.
- BACKUP/RESTORE: `storage.exportBackup` + `exportIndexedDBData` backup `board data + image blobs`; restore `restoreIndexedDBData` — OK.
- Tình trạng: `Board restored nhưng image mất` đã fix (Phase 7); ngược lại `Image còn nhưng board mất` còn có thể sau `deleteBoard` (chưa purge blobs).

## 14. KHBD ↔ SGK ↔ Whiteboard ↔ AI (§10-16)

- BookContext đã unify 80% — còn `BookReader → AI` (AssistantBubble) chưa truyền `appContext` đầy đủ (chỉ local draft), `Whiteboard → AI` chưa truyền `board.selectedObjects`.
- KHBD giữ `metadata.bookReference / bookReferences[]` shape ổn định — migration `bookReference.sourceStatus="missing"` khi delete book — OK.
- Integration Hub `core/integration.js: open({target,payload,source})` đã có, nhưng các "Send to Whiteboard" vẫn mỗi nơi một protocol (`whiteboardIntegration.sendToWhiteboard`, `sendBookSelectionToBoard`, `sendScanToBoard`) — chưa thống nhất về `integration.open`. Helper hiện tại là wrapper, chấp nhận được.

## 15. Search / Dashboard / AI Context

- Search: `GlobalSearch.jsx` + `searchIndex.js` đã unified `type/title/description/sourceRef/action` và `integration.open` click → correct module/page — OK.
- Dashboard: domain-driven, chỉ query services, `DATA_UPDATED → refresh widget` (selective) không reload toàn app — OK.
- AI: `core/appContext.js buildAppContext({book,page,view,lessonPlan,board,selectedText})` đã có — nhưng `AssistantBubble` nhận `appContext` từ App.jsx chưa đầy đủ `selectedText/chapter` — debt nhẹ.

## 16. Backup / Restore / Integrity (§22-23)

- Backup: `storage.exportBackup` lấy từ `BACKUP_KEYS` (core) + `getAllRecords(STORES)` 7 stores (nay 8 với `wb_images`) — unified.
- Restore: `validate → migrate (old key sgk_theme) → restore → rebuild index (searchIndex) → emit sgk:data-updated → refresh app` — OK.
- Integrity: `dataIntegrity.js: checkIntegrity(books) + repairIntegrity({dryRun})` với backup snapshot + orphan cleanup + sourceRef citation fix — OK, nhưng còn direct `localStorage.setItem/removeItem` trong repair (có thể qua safeStorage).

## 17. Technical debt còn lại — ưu tiên Phase 8

1. **117 direct localStorage hits** ở 17 files (lớn nhất `dataIntegrity 20`, `SettingsCenter 21`, `syncService 17`) — migrate dần về `safeStorage`/`storageAdapter`.
2. **10 fake `new Event("storage")`** + **7 view loop rebroadcasts** — xóa ngay, thay bằng `appEvents.emitDataUpdated`.
3. **~40 direct `window.dispatchEvent(new CustomEvent)`** — chỉ giữ trong `core/appEvents.js`, các nơi khác gọi `appEvents.emit`.
4. **`normalizeSourceRef()`** chưa tồn tại — thêm vào `core/bookContext.js`.
5. **`viewRegistry` chưa render loop trong App.jsx** — App.jsx còn 26 `view==="..."` switches.
6. **Whiteboard deleteBoard chưa purge `wb_images` blobs** + **Delete book chưa purge whiteboard refs**.
7. **`storage.js` duplicate `BACKUP_KEYS/CACHE_PREFIXES` arrays** — nên `import {BACKUP_KEYS} from core/storageKeys` trực tiếp.

---

> Audit này là baseline cho Phase 8. Mọi sửa đổi phải giữ backward-compat: `old data → adapter → new code` vẫn đọc được, migration `legacy → detect → migrate → verify → canonical` trước khi xóa.
