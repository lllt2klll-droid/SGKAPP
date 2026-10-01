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

Xem: `docs/TECHNICAL_DEBT.md §1`, `docs/ARCHITECTURE.md §9 và §12`, `docs/LEGACY_DEPRECATION.md`.
