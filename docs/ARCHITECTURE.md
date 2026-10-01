# ARCHITECTURE — SGK Teacher Workspace

> Cập nhật 2026-10-01 (gộp từ `APP_INTEGRATION_REPORT.md` + `ARCHITECTURE_AUDIT.md` (root);
> 2026-10-01 còn dọn 3 file core 0 importer → `docs/_attic/src-core/`).
> Số liệu baseline lịch sử Phase 8: xem `docs/history/`.

## 1. Tổng quan

```
┌─ UI ─────────────────────────────────────────────────────────────────────┐
│ App.jsx (APP SHELL, 4.167 dòng)                                         │
│   nav  → core/navigationRegistry.buildNavSections() / getBreadcrumb()   │
│   view → core/viewRegistry (26 view, lazy + Suspense)                   │
│   bus  → core/appEvents (47 events)                                     │
└─────────────────────────────────────────────────────────────────────────┘
         │
┌─ CORE (src/core/, 8 module single-source) ──────────────────────────────┐
│ navigationRegistry  viewRegistry  appEvents  crossTab  storageKeys      │
│ bookContext  errors  storageHealth                                      │
└─────────────────────────────────────────────────────────────────────────┘
         │
┌─ DOMAIN SERVICES ───────────────────────────────────────────────────────┐
│ userdata · teachingDB · researchDB · personalDB · settingsStore         │
│ missionStore/missionEvents · aiDataStorage · scanStore · searchIndex    │
│ whiteboardStore + whiteboard/imageStore · syncService (LOCAL_SIMULATION)│
└─────────────────────────────────────────────────────────────────────────┘
         │
┌─ STORAGE ───────────────────────────────────────────────────────────────┐
│ safeStorage (LS an toàn) │ indexedDB SGKAppDB v5 (10 stores)            │
│ storage.js (backup/restore/wipe/migrate/delete cascade)                 │
└─────────────────────────────────────────────────────────────────────────┘
```

Nguyên tắc: **không rewrite, không architecture song song** — mỗi thứ chỉ có 1 nguồn,
module cũ được giữ làm wrapper/backward-compat có ghi chú (xem `LEGACY_DEPRECATION.md`).

## 2. Hiện trạng số liệu (2026-10-01)

| Hạng mục | Giá trị |
|---|---|
| Module nguồn | `src/` **140 file** không tính test (161 file `.js/.jsx`) |
| Test | **31 file test** (`src/` 21 + `tests/` 9 + `server/` 1) → **329 test / 57 suites** pass; e2e **5 spec → 24/24** |
| Lint | oxlint 0 warnings / 0 errors (179 file, 89 rules) |
| View | 26 trong `VIEW_REGISTRY` (21 lazy + 5 inline `component:null`) |
| Event | 47 entries `AppEvents` + `DataDomains` |
| IndexedDB | `SGKAppDB` **v5**, 10 stores |
| Truy cập LS trực tiếp ngoài module được phép | 4 hit (chẩn đoán `SettingsCenter`) + 4 comment |
| `window.dispatchEvent` ngoài `core/appEvents.js` | 0 (1 dòng comment) |

## 3. Navigation & View Registry

- **Nav:** `src/core/navigationRegistry.js` — `VIEWS`, `NAVIGATION_CONFIG`, `FOOTER_NAV`,
  `VIEW_ALIASES`, `normalizeViewId`, `getBreadcrumb`, `buildNavSections`, `getFooterNav`,
  `SECTION_META`, `viewsBySectionId`. `App.jsx` gọi `buildNavSectionsCore({badges})` (useMemo)
  + `getBreadcrumbCore(view)` — không còn `NAV_SECTIONS` inline 150 dòng.
- **View:** `src/core/viewRegistry.js` — mỗi entry `{ id, label, section, sectionId, component,
  breadcrumb, mobile, keywords, related }`; `component` là `lazyWithRetry(() => import(...))`.
- **Render:** `App.jsx` render nhánh lazy qua `getViewEntry(view)` → `entry.component`
  (không còn danh sách id viết tay). 5 view **cố ý inline** (`library, continue, marks, vocab, stats`)
  đánh dấu `component: null` vì phụ thuộc state/closures của App (bộ lọc thư viện, history,
  bookmarksMap, vocabList, quiz stats).
- **Legacy:** `navigationConfig.js`, `components/navigationConfig.js`, `components/Navigation.jsx`
  đã **xóa** (0 importer trước khi xóa).

## 4. Event system (MODEL A bus)

`src/core/appEvents.js`:

- `AppEvents` (47 key) + `DataDomains`; API `appEvents.emit/on/once/off` + `emitDataUpdated({domain,action,id})`.
- **Quy tắc:** mọi module chỉ `appEvents.emit(...)`; `window.dispatchEvent` **chỉ** nằm trong file này
  (đánh marker để tránh loop) — phục vụ listener legacy `window.addEventListener("sgk:...")`.
- Lắng nghe window → bus: event không có marker sẽ được forward vào direct listener (đóng `once`).
- **Alias domain:** emit `SCAN_SAVED / WHITEBOARD_UPDATED / WEBTOOLS_UPDATED / LESSON_PLAN_UPDATED...`
  tự động bắn thêm `sgk:data-updated` (catch-all cho Dashboard/DataTools) → không phải emit 2 lần.
- `missionEvents`, `settingsStore`, `safeStorage`, `storage`, `syncService`, các View đều đã qua bus.
- Fake `new Event("storage")`: **0 hit** (bridge `storage` trong appEvents đã bỏ, thay bằng bus).
- Guard môi trường: `typeof window === "undefined"` → no-op trong test/Node.

### 4.1 Cross-tab (`src/core/crossTab.js`)

- Event `storage` **chỉ** sync được `localStorage`. Kho IndexedDB (bảng trắng, scan, clip…)
  không có event cross-tab → tab B không biết tab A vừa tạo/sửa bảng.
- `BroadcastChannel("sgk:bus")` nhận việc này: `appEvents.emit` → `publishCrossTab`
  (whitelist 10 event **dữ liệu**), tab nhận chạy lại `emitLocal` với `_remoteDispatchDepth > 0`
  → **không** publish tiếp (không ping-pong), không echo message có `from === SENDER_ID`,
  không phát `detail.source === "cross-tab-sync"` (chặn vòng lặp storage → broadcast).
- Không bao giờ broadcast điều hướng/UI (`NAVIGATE`, `OPEN_*`, `SEND_TO_WHITEBOARD`…) —
  tab khác không bị "nhảy view" theo tab đang thao tác.
- `SETTINGS_UPDATED` cố ý **không** nằm trong whitelist: đã có event `storage`.
- Môi trường không có `BroadcastChannel` (Node, trình duyệt cũ) → kênh không mở, publish
  trả `false`, app vẫn chạy nhờ `storage` như cũ. Ở Node gọi `unref()` để test không treo.

## 5. Storage

### 5.1 Lớp

| Lớp | File | Vai trò |
|---|---|---|
| API an toàn | `src/safeStorage.js` | `safeGetJSON/SetJSON/GetString/SetString/Remove`, validator, quota, `backupCorrupted`, `listKeys(ByPrefix)`, `removeKeysByPrefix` |
| Khóa chuẩn | `src/core/storageKeys.js` | `STORAGE_KEYS`, `BACKUP_KEYS`, `CACHE_PREFIXES`, `isBackupKey/isCacheKey`, `lastPageKey/ocrKey/wbBoardKey/marksKey...` (14 file import) |
| Lifecycle | `src/storage.js` | `exportBackup/importBackup/restoreIndexedDBData/wipeAppData/migrateBookData/removeBookData` — re-export `BACKUP_KEYS` từ core |

> **Đã dọn (2026-10-01):** `src/core/storageAdapter.js` (hợp đồng domain `DOMAIN_CONFIG` + `storage.get/set/remove/list`)
> từng có **0 importer** — lượng migrate thực tế đi qua `safeStorage` + domain service
> (`userdata/teachingDB/researchDB/...`). File được lưu ở `docs/_attic/src-core/` rồi gỡ khỏi `src/core/`.

### 5.2 Canonical theo domain (thực tế trong code)

| Nơi lưu | Domain |
|---|---|
| localStorage (qua domain service / `safeStorage`) | settings, bookmarks, vocab, quizHistory, collections, lessonPlans, activities, worksheets, questions, ideas, tasks, internship, webtools, customTitles, favs, history, counts, marks & teacherNotes (key per file), missions, ai cache |
| IndexedDB `SGKAppDB` | scans (+LS thumbnail), clips/refs/concepts/evidence, ocr, searchIndex, whiteboard boards + `wb_images`, note images |

Quy tắc tổng: **setting/nhẹ → LS; dữ liệu lớn, blob, index, whiteboard → IndexedDB.**
Chiến lược này **không còn mô tả ở một file trung gian** — nó nằm ngay trong các domain service +
`safeStorage` (`storageAdapter.js` với `DOMAIN_CONFIG` đã chuyển sang `docs/_attic/src-core/`).

### 5.3 Quy tắc phím

- Key người dùng (`sgk_*`, `notes_*`, `ocr_*`...) nằm trong `STORAGE_KEYS`/`BACKUP_KEYS` — không viết chuỗi cứng trong view.
- `isBackupKey` → backup/restore; `isCacheKey` → chỉ clear cache, không backup.
- View không đọc/ghi `localStorage` trực tiếp; ngoại lệ có chủ đích: probe `core/storageHealth.js`,
  chẩn đoán `SettingsCenter` (4 hit), test, comment.

## 6. IndexedDB

- DB **`SGKAppDB` v5** (`src/indexedDB.js`), 10 stores:

| Store | KeyPath | Nội dung |
|---|---|---|
| `ocr_cache` | key | kết quả OCR per page |
| `search_index` | key | index tìm kiếm per book |
| `clips` `refs` `concepts` `evidence` | id | dữ liệu nghiên cứu (hybrid) |
| `scan_assets` | id | ảnh gốc đã quét (LS `sgk_scans_v1` chỉ giữ thumbnail) |
| `wb_images` | id | Blob ảnh bảng trắng (board chỉ giữ `imageId`) |
| `whiteboard_boards` | id | board JSON (objects/connectors/viewport/settings/sourceRefs) |
| `note_images` | id | ảnh nhúng trong ghi chú |

- `imageStore` có fallback 1 lần sang `SGKWhiteboardDB` cũ (`migrateLegacyIfNeeded`) — backup/đóng băng không mất ảnh.
- Test Node không có `indexedDB` → mọi API no-op an toàn (trả fallback/fail nhẹ, không throw).

## 7. Settings

- Single source: `src/settingsStore.js` — key `sgk_settings` v1, `DEFAULT_SETTINGS` + `deepMerge`
  + migration (`sgk_theme` → `appearance.theme`, `soundVolume/soundProfile` mặc định).
- Change flow: `updateSettings(patch)` → save → apply CSS vars → `appEvents.emit(SETTINGS_UPDATED)`.
- `subscribeSettings(fn)` phát **1 lần** mỗi thay đổi (bus-only, không double-fire).
- UI: `SettingsCenter.jsx` (tab Hành vi có nhóm Âm thanh: bật/tắt, âm lượng, kiểu, nút thử).

## 8. BookContext & SourceRef

- `src/core/bookContext.js`: `BookContext/BookProvider/useBookContext`, `makeBookContext(book,page)`,
  `makeSourceRef(ctx)`, **`normalizeSourceRef(input, fallbackBook)`** + `isValidSourceRef`.
- Shape chuẩn: `{ filename, title, page, bookPage, chapter, citation, subject, grade }`.
- `normalizeSourceRef` đọc được mọi shape legacy (`bookId/file/fileName/book/source/pageNumber/chapterTitle/grade/lop/subject/monHoc`) —
  reader gọi normalize trước khi dùng, không xoá legacy ngay.

## 9. Integration (đã gộp về bus)

**Đã dọn (2026-10-01):** `src/core/integration.js` (`integration.open` / `fromBookToModule` / `fromKhbdToModule`)
được thiết kế làm cổng duy nhất cho "gửi sang module" nhưng **0 importer thật** —
`whiteboardIntegration.js` chỉ nhắc nó trong comment, còn mọi luồng khác đều phát event
trực tiếp qua `appEvents`. File lưu ở `docs/_attic/src-core/`.

Quy tắc hiện hành: **gọi module khác = `appEvents.emit(...)`** (xem `core/appEvents.js`, 47 event).

| Luồng | Đường đi thực tế |
|---|---|
| Sách → Whiteboard | `whiteboardIntegration.sendBookSelectionToBoard/sendToWhiteboard` → `queuePendingPayload` + `emit(NAVIGATE)` |
| Search/KHBD → Sách | `appEvents.emit(OPEN_SOURCE, {filename,page})` |
| KHBD → Whiteboard | `emit(SEND_TO_WHITEBOARD)` + `mindmapEngine` |
| AI → người dùng | `AssistantBubble` tự dựng context từ prop `appContext` của App (file `core/appContext.js` đã gỡ — 0 importer) |
| Mọi nơi → view | `appEvents.emit(NAVIGATE/OPEN_*, ...)` |

## 10. Các module chính

| Module | Thành phần | Ghi chú |
|---|---|---|
| Đọc sách | `BookReader.jsx` + `pdfRenderer/pageNavigation/zoomController` | PDF.js, chọn vùng, notify layer (toast + âm thanh) |
| Quét ảnh | `scan/` (ScanModal, coordinates, capture, store, aiService) | ảnh gốc IDB `scan_assets`, sự kiện `SCAN_SAVED` |
| Bảng trắng | `whiteboard/whiteboardStore + WhiteboardCanvas + imageStore` | board IDB, blob ảnh IDB, sourceRef giữ nguồn trích dẫn |
| Soạn dạy | `khbd/` (planModel, planAi, LessonPlanView, templateEngine, docxBuilder) | `sgk_lessonplans` LS; autosave theo plan |
| Nghiên cứu | `researchDB` (clips/refs/concepts/evidence) | hybrid IDB canonical |
| Tìm kiếm | `searchIndex` + `GlobalSearch` + `SearchView` | index IDB, bỏ dấu tiếng Việt, click → `OPEN_SOURCE` |
| AI | `aiService` + `aiDataStorage`; context từ prop `appContext` của App | `core/appContext.js` đã gỡ (0 importer) — xem §12 |
| Nhiệm vụ | `missionStore/missionEvents/registry` | chỉ phát âm khi hoàn thành thật |
| Dashboard | `DashboardView` | query domain service, refresh selective theo `DATA_UPDATED` |
| Âm thanh | `audio/soundManager` | xem `docs/AUDIO.md` |

## 11. Data lifecycle

| Thao tác | Đường đi | Trạng thái |
|---|---|---|
| **Backup** | `storage.exportBackup` = `BACKUP_KEYS` (LS) + `exportIndexedDBData(Object.values(STORES))` (10 stores, Blob → base64) | ✅ |
| **Restore** | validate schema → atomic `saveBatch` (có snapshot rollback) → rebuild index → `emit DATA_UPDATED` | ✅ |
| **Wipe** | `wipeAppData` xoá LS theo `isBackupKey` + `clearAllIndexedDBData()` (gồm `wb_images`) | ✅ |
| **Rename sách** | `migrateBookData(old,new)` transactional: ghi mới → verify → dọn cũ, rollback lỗi; có test | ✅ |
| **Xoá 1 bảng trắng** | `deleteBoard` → metadata + `board_*` + **`purgeUnreferencedImageBlobs`** (xoá blob không còn tham chiếu) | ✅ (đã đóng nợ) |
| **Xoá 1 sách** | `storage.removeBookData(file)` → LS per-book + LS arrays + IDB clips/refs/... + `whiteboardStore.purgeBookRefs(file)` + đánh dấu lessonPlan `sourceStatus="missing"` | ✅ (đã đóng nợ) |
| **Tính toàn vẹn** | `dataIntegrity.checkIntegrity(books)/repairIntegrity({dryRun})` — orphan, broken refs, duplicate IDs; có backup trước khi sửa | ✅ |
| **Sức khoẻ LS** | `core/storageHealth.js` — quota, orphan blob, thống kê (probe raw có chủ đích) | ✅ |

## 12. Module core chưa có importer (trung thực)

Đếm importer (file khác import, trừ file tự thân):

| Module core | Importer | Trạng thái |
|---|---|---|
| `appEvents` | 27 | ✅ bus chính |
| `storageKeys` | 14 | ✅ |
| `errors` (`toFriendlyError`…) | 5 | ✅ |
| `bookContext` | 4 | ✅ |
| `navigationRegistry` | 1 (App.jsx) | ✅ |
| `viewRegistry` | 1 (App.jsx) | ✅ |
| `storageHealth` | 1 | ✅ (chỉ SettingsCenter) |
| `crossTab` | 1 (appEvents) | ✅ đồng bộ cross-tab |

**Không còn module core nào ở mức 0 importer.** Ba file cũ từng 0 importer thật
(`integration`, `storageAdapter`, `appContext` — tổng 471 dòng) đã được đối chiếu lại rồi chuyển
sang `docs/_attic/src-core/` (2026-10-01): `whiteboardIntegration` chỉ *nhắc* hub trong comment,
không import. Xem `docs/TECHNICAL_DEBT.md §1`.

## 13. Quy tắc khi thêm module mới

1. Đăng ký **1 dòng** trong `core/viewRegistry.js` (+ `navigationRegistry` nếu có mục nav).
2. Dữ liệu qua domain service (`userdata/teachingDB/researchDB/...`) hoặc `safeStorage` — không `localStorage.*` trực tiếp.
3. Phát sự kiện qua `appEvents.emit` — thêm entry vào `AppEvents` nếu là event mới.
   Event **dữ liệu** cần thấy ở tab khác → thêm vào whitelist `CROSS_TAB_EVENTS` trong `core/crossTab.js`.
4. Nhận/truyền nguồn trích dẫn qua `makeSourceRef`/`normalizeSourceRef`.
5. Gọi module khác qua `appEvents.emit` (event đích) — không tạo hub trung gian mới.
6. Chạy `npm run lint && npm test && npm run build` trước khi nhận.

## 14. Kiểm chứng

```bash
npm run lint      # 0/0 (179 files, 89 rules)
npm test          # 329/329 (57 suites)
npm run build     # 1.994 modules, PWA 78 entries
npm run test:e2e  # 24/24 (5 spec, cần dist/)
```
