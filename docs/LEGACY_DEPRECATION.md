# LEGACY_DEPRECATION — SGK App

> Cập nhật **2026-10-01** (bản gốc 2026-09-13 — `docs/history/`).
> Mục đích: mọi thứ "cũ" phải có lý do tồn tại + nơi thay thế + thời điểm xoá.

## Quy tắc phân loại

- **A — Còn dùng (giữ + migrate dần):** vẫn được gọi, nhưng code mới phải dùng bản thay thế.
- **B — Compatibility only:** chỉ để dữ liệu/bundle cũ không vỡ; **không** import trong code mới.
- **C — Dead (0 caller):** xác nhận không còn tham chiếu → xoá ở major tiếp theo.

---

## Đã đóng (bảng dưới là bản cập nhật)

| Mục | Trạng thái 2026-09-30 |
|---|---|
| `src/navigationConfig.js`, `src/components/navigationConfig.js` | ✅ **Đã xoá** (0 importer) |
| `src/components/Navigation.jsx` | ✅ **Đã xoá** (0 importer) |
| Fake `new Event("storage")` (10 view + userdata/personalDB/App) | ✅ **0 hit** toàn src |
| `window.dispatchEvent` viết tay ngoài bus (31 niche + 18 `new CustomEvent`) | ✅ **0 hit** — 23 file dùng `appEvents.emit` |
| `safeStorage` / `settingsStore` dispatch thẳng | ✅ đã qua `appEvents.emit` |
| `khbdAutosaveEngine.js` (13 hit LS) | ✅ **file đã xoá** — autosave đi `khbd/planModel.js` |
| `dataIntegrity` (20), `syncService` (17), `relatedData`, `searchIndex`, `AssistantBubble`, `BookReader`, `StructuredNotes`, `UtilityBubble` direct LS | ✅ **0 hit** (qua `safeStorage`) |
| `storage.js` duplicate `BACKUP_KEYS/CACHE_PREFIXES` | ✅ re-export từ `core/storageKeys` |
| `App.jsx` 26 `view ===` switch cho view lazy | ✅ render qua `getViewEntry()`; còn 5 view inline có chủ đích |
| Audio "placeholder MP3 1605 bytes" | ✅ asset `.wav` thật + `SYNTH_PRESETS`; 11 file `.mp3` trùng đã xoá |

## Bảng legacy còn lại

| File / Mục | Replacement | Status | Ghi chú |
|---|---|---|---|
| `src/storage.js: readJSON/saveJSON/saveBatch` (4 export) | `src/safeStorage.js` | **A** | Vẫn dùng trong migration/legacy test; code mới dùng `safeStorage` |
| `src/storage.js: BACKUP_KEYS/CACHE_PREFIXES` (re-export) | `src/core/storageKeys.js` | **B** | Chỉ còn `export const BACKUP_KEYS = _BACKUP_KEYS_CORE` — giữ cho import cũ |
| `STORAGE_KEYS.LESSON_PLANS_LEGACY = "sgk_lessonPlans"` (3 hit) | `STORAGE_KEYS.LESSON_PLANS` | **B** | Giữ để backup cũ restore được |
| `sgk_theme` (8 hit: `App.jsx`, `settingsStore`, `storageKeys`, `userdata`) | `sgk_settings.appearance.theme` | **B** | Chỉ trong migration/wipe — không cho module mới đọc |
| `SKG_TEACHER_MODE` typo (1 hit, `storage.wipeAppData`) | `SGK_TEACHER_MODE` | **B** | Chỉ để wipe không bỏ sót key cũ |
| `src/whiteboard/imageStore.js: SGKWhiteboardDB` (2 hit) | `SGKAppDB / STORES.WB_IMAGES` | **B** | One-time `migrateLegacyIfNeeded()` **+ nhánh dự phòng khi ghi IDB lỗi** (`saveImageBlob`/`deleteImage`) — giữ |
| `src/core/appEvents.js` window bridge (5 dòng dispatch) | `core/crossTab.js` (BroadcastChannel) | **A** | **Đã tách 2026-10-01:** bridge chỉ lo listener legacy **in-tab**; **cross-tab** đi qua `BroadcastChannel` ở `core/crossTab.js` |
| `src/syncService.js` `LOCAL_SIMULATION` (6 hit) | — | **A (cố ý)** | Spec: không biến thành cloud sync giả |
| `src/whiteboard/whiteboardStore.js: queuePendingPayload` + `whiteboardIntegration.send*` (6 hit) | `appEvents.emit(SEND_TO_WHITEBOARD/NAVIGATE)` | **A** | Đã phát event qua bus — hub `core/integration.js` không được import, đã dọn (2026-10-01) |
| `core/bookContext.js` xử lý shape legacy (`bookId/file/fileName/...`) | `normalizeSourceRef()` | **B** | Reader tự normalize — chưa xoá shape cũ |
| `App.jsx` 5 view inline (`library/continue/marks/vocab/stats`) | `viewRegistry` render loop | **A (có chủ đích)** | `component: null` + chú thích trong registry |
| `SettingsCenter.jsx` 4 hit `localStorage.*` (chẩn đoán) | `safeStorage` | **A (có chủ đích)** | Phải đọc raw để đo sức khoẻ bộ nhớ |
| ~~`core/storageAdapter.js` — **0 importer**~~ | `safeStorage` + domain service | **Đã đóng (2026-10-01)** | chuyển `docs/_attic/src-core/storageAdapter.js` |
| ~~`core/appContext.js` — **0 importer**~~ | prop `appContext` của App | **Đã đóng (2026-10-01)** | chuyển `docs/_attic/src-core/appContext.js` |
| ~~`core/integration.js` — **0 importer thật**~~ | `appEvents.emit` | **Đã đóng (2026-10-01)** | chuyển `docs/_attic/src-core/integration.js` |

## Việc cần làm ở major tiếp theo

- [x] Xoá `src/components/Navigation.jsx`, `src/navigationConfig.js`, `src/components/navigationConfig.js`
- [x] Xoá fake `new Event("storage")` + 31 `window.dispatchEvent` viết tay
- [x] Migrate direct `localStorage` ở view/service về `safeStorage`
- [x] Đóng nợ Whiteboard: purge blob khi xoá bảng, purge sourceRef khi xoá sách
- [x] Quyết định số phận `core/storageAdapter.js`, `core/appContext.js`, `core/integration.js` → **đối chiếu 0 importer rồi chuyển `docs/_attic/src-core/`** (2026-10-01)
- [x] **Đánh giá 2026-10-01 — giữ** `sgk_lessonPlans`/`sgk_theme`/`SKG_TEACHER_MODE` trong `BACKUP_KEYS`
      (còn code đọc lại → xoá = mất bản sao lưu) và fallback `SGKWhiteboardDB`
      (đọc song song + **nhánh dự phòng ghi khi IDB lỗi**) — xem `TECHNICAL_DEBT.md §3`
- [x] Đổi cross-tab sang `BroadcastChannel` → **`src/core/crossTab.js`** (2026-10-01);
      `window` bridge giữ cho listener legacy in-tab
- [ ] (tuỳ chọn) Đưa 5 view inline vào `viewRegistry` render loop — chưa làm, giữ `component: null`

## Cam kết

- Không xoá file/module ngoài việc đánh dấu deprecated khi chưa đủ bằng chứng 0 importer.
- Không đổi business logic — chỉ `adapter`/`event bus` wrapper; dữ liệu cũ `old data → adapter → new code` vẫn đọc được.
- Mọi thay đổi phải giữ `npm run lint && npm test && npm run build` xanh.
