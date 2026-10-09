# _attic — mã đã đưa ra khỏi `src/` (giữ lại để tra cứu)

Không có git trong thư mục này, nên **trước khi xoá file nào trong `src/` tôi đều copy vào đây**.
File trong `_attic` **không được build, không được test, không được lint** — chỉ là kho lưu.

## `src-core/` — chuyển ngày 2026-10-01

Đối chiếu trước khi chuyển: grep toàn dự án (`*.js,*.jsx,*.md,*.json,*.html`, loại `node_modules`/`dist`)
→ **0 importer thật** cho cả 3 file.

| File | Dòng | Lý do | Thay thế hiện tại |
|---|---|---|---|
| `storageAdapter.js` | 304 | Hợp đồng domain `DOMAIN_CONFIG` (ls / ls-prefix / idb / hybrid) + `storage.get/set/remove/list` — chưa module nào import | `safeStorage.js` + domain service (`userdata`, `teachingDB`, `researchDB`, `settingsStore`...) |
| `appContext.js` | 54 | `buildAppContext` / `contextToPromptSuffix` — 0 importer | `AssistantBubble.jsx` tự dựng context từ prop `appContext` của App |
| `integration.js` | 113 | `integration.open({target,payload,source})` — 0 importer thật (`whiteboardIntegration` chỉ nhắc trong **comment**) | `appEvents.emit(...)` (47 event, `src/core/appEvents.js`) |

Tổng 471 dòng. Nếu sau này cần wire lại, copy về `src/core/` rồi chạy
`npm run lint && npm test && npm run build`.

## `src-dead/` — chuyển ngày 2026-10-05

Quét lại toàn app: grep `*.js,*.jsx,*.html,*.css` (loại `node_modules`/`dist`/`docs`)
→ **0 importer** cho cả 8 file (chỉ có tham chiếu nội tại).

| File | Dòng | Lý do | Thay thế hiện tại |
|---|---|---|---|
| `SyncPanel.jsx` | 293 | UI "Đồng bộ" không view nào mount (`syncService` chỉ còn `storagePhase6.test.js` dùng) | `DataToolsView.jsx` — Xuất/khôi phục file `.json` |
| `relatedData.js` | 259 | 0 importer, chỉ tự tham chiếu | `researchDB.js` + `core/bookContext.js` (`normalizeSourceRef`) |
| `WhiteboardView.jsx.empty` | 0 byte | file rỗng ở `src/` trùng tên với bản thật | `src/whiteboard/WhiteboardView.jsx` |
| `AppHeader.jsx` | 101 | header tối giản — **0 importer**, App tự render `<header className="global-header">` (`App.jsx:2238`) | `App.jsx` global-header |
| `AppShell.jsx` | ~180 | khung app — **0 importer** | `App.jsx` (shell chính) |
| `ui.jsx` | 170 | bộ UI kit Phase 4 (`Button/Card/Modal/Tabs...`) — **0 importer**, chưa view nào dùng | HTML + class CSS hiện có (`.btn`, `.card`, `.modal-overlay`) |
| `audio/index.js` | 7 | barrel export — **0 importer** | import trực tiếp `./audio/soundManager.js` |
| `ktspLogo.js` | 3 | biến `KTSP_ROUND_LOGO_B64` (269 KB base64) chỉ `khbd/docxBuilder.js` dùng — nay đã tách thành file thật | `public/assets/ktsp-logo.png` (201.7 KB), `docxBuilder` `fetch()` lúc bấm Xuất Word |

Tổng 8 file đã chuyển (≈311 KB), `src/` còn **174 file** lint.

> `syncService.js` **giữ lại** trong `src/` (được `storagePhase6.test.js` kiểm chứng,
> không import từ UI nên không vào bundle) — chờ quyết định: wire lại hay chuyển tiếp vào đây.

**Hiệu năng:** chunk `docxBuilder` 284 KB → ~30 KB (logo không còn là chuỗi base64 trong JS);
PNG được PWA precache (`globPatterns` có `png`) nên lúc xuất Word không phát sinh thêm request mạng.

Xem: `docs/TECHNICAL_DEBT.md §1`, `docs/ARCHITECTURE.md §9 và §12`, `docs/LEGACY_DEPRECATION.md`.
