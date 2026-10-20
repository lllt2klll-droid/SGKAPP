# SGK Teacher Workspace

Không gian làm việc của giáo viên tiểu học (lớp 1–5): thư viện SGK số, soạn giáo án/KHBD,
hoạt động & phiếu học tập, ngân hàng câu hỏi, bảng trắng, quét ảnh AI, tìm kiếm toàn văn.
**Chạy local/offline** — dữ liệu nằm ở localStorage + IndexedDB trên máy người dùng, không có cloud.

## Công nghệ

| Lớp | Thành phần |
|---|---|
| Frontend | React 19 + Vite 8 + PWA (Workbox precache), PDF.js (`pdfjs-dist`), Lucide icons |
| Backend | Express + multer + cors (`server.js`, `127.0.0.1:5000`) — chỉ phục vụ file/OCR/content |
| Kiểm thử | `oxlint` (lint), `node --test` (unit), `playwright-core` (e2e) |
| Phụ trợ | `xlsx`, `docx`, `jszip`, `mammoth` (import/export tài liệu) |

## Lệnh

```bash
npm run dev          # Vite dev server (127.0.0.1:5173, proxy /api → :5000)
npm run dev:backend  # API server
npm run dev:all      # cả hai (concurrently)
npm start            # API server production (node server.js)
npm run build        # build production + service worker
npm run preview      # xem dist/
npm run lint         # oxlint
npm test             # unit/integration (node --test)
npm run test:e2e     # e2e (cần dist/ đã build, port 5321)
npm run start:bg     # start server nền (PowerShell)
```

## Cấu trúc

```
sgk-app/
├── server.js              # Express API: /api/books (PDF, content), /api/health, OCR proxy
├── vite.config.js         # Vite 8 + PWA + manualChunks (vendor/xlsx/docx/jszip/mammoth/...)
├── index.html
├── public/                # icons, audio/ui/*.wav, khbd templates
├── src/
│   ├── App.jsx            # APP SHELL: state toàn cục, nav, render view (~4.300 dòng; đo lại: Get-Content src/App.jsx | Measure-Object -Line)
│   ├── core/              # 8 module "single source of truth" (xem docs/ARCHITECTURE.md)
│   ├── components/        # UI dùng chung (FileDropzone, MobileBottomNav, ReaderMobileBar)
│   ├── khbd/              # soạn giáo án: planModel, planAi, LessonPlanView, template...
│   ├── scan/              # quét ảnh: ScanModal, scanCapture, scanStore, scanAIService
│   ├── whiteboard/        # whiteboardStore, WhiteboardCanvas, imageStore (IDB blobs)
│   ├── audio/             # soundManager (WebAudio synth + file .wav)
│   ├── *View.jsx          # các view (lazy-loaded qua VIEW_REGISTRY)
│   ├── storage.js         # lifecycle dữ liệu: backup/restore/wipe/migrate/removeBookData
│   ├── safeStorage.js     # API localStorage an toàn (JSON validator, quota, backupCorrupted)
│   └── indexedDB.js       # SGKAppDB (v5, 10 stores)
├── tests/                 # node:test + tests/e2e (playwright-core)
└── docs/                  # tài liệu thống nhất (xem dưới)
```

> **Backup:** bản snapshot đầy đủ nằm ở thư mục cha: `../sgk-app-backup-<ngày>.zip`
> (đã thay các bản `_backup/` và `sgk-app.zip` cũ ngày 2026-10-01). Giải nén đè để hoàn nguyên.

## Kiến trúc nhanh

```
App.jsx ──► core/navigationRegistry (1 nguồn nav) ──► core/viewRegistry (26 view, lazy)
        ──► core/appEvents (1 bus, 47 events; chỉ appEvents.js được dispatch window)
        ──► core/storageKeys + safeStorage/storage (storage canonical)
        ──► core/bookContext (sourceRef chuẩn) ──► appEvents.emit (gọi module khác)
        ──► storage + indexedDB (lifecycle: backup/restore/wipe/delete cascade + integrity)
```

- **Storage:** setting/nhẹ → localStorage; dữ liệu lớn & blob (clips, refs, scan, whiteboard, OCR, index) → IndexedDB.
- **Event:** mọi module phát qua `appEvents.emit(...)`; `window.dispatchEvent` chỉ nằm trong `core/appEvents.js` (bridge cho legacy listener).
- **Xóa sách:** `storage.removeBookData(file)` → LS per-book + IDB + `whiteboardStore.purgeBookRefs()` + purge blob ảnh mồ côi.

## Trạng thái kiểm chứng (2026-10-16 — chạy lại sau đợt hoàn thiện, số liệu cũ xem docs/history/)

| Kiểm tra | Kết quả |
|---|---|
| `npm run lint` | **0 warnings / 0 errors** (204 files, 89 rules) |
| `npm test` | **536/536 pass**, 75 suites, 0 fail |
| `npm run build` | OK — PWA precache **82 entries**, 0 cảnh báo |
| `npm run test:e2e` | Chạy khi cần (`tests/e2e`, cần dist + port 5321) |
| Kích thước code | `src/` 146 module không tính test, **~71.000 dòng** |

> Số liệu cũ (474/474, 37/37 e2e, 78 precache…) đã lỗi thời sau các đợt sửa — xem baseline gốc ở `docs/history/` chỉ để đối chiếu.

> 3 file `src/core/` từng 0 importer (`storageAdapter`, `appContext`, `integration`, 471 dòng)
> đã đối chiếu rồi chuyển sang `docs/_attic/src-core/` ngày 2026-10-01 (repo không có git).

## Thay đổi 2026-10-01 — không auto-index khi mở app

Trước đây `App.jsx` **tự động** tải + đọc toàn bộ thư viện để lập chỉ mục tìm kiếm mỗi lần
mở app trên trình duyệt chưa có chỉ mục → đo được **342 MB / 12 giây** (thư viện 97 PDF, 1,4 GB).

Giờ chỉ mục tự động **tắt mặc định** (`settingsStore.js → library.autoIndexNewBooks = false`),
và `App.jsx` tôn trọng setting này cho **mọi** sách (hết nhánh "sách mới luôn index").

| Việc | Nơi |
|---|---|
| Bật lại (nếu muốn) | Cài đặt → Thư viện → **Tự index sách mới** |
| Lập chỉ mục thủ công | tab **Tìm toàn văn** → nút **Dựng chỉ mục** (1 sách hoặc cả thư viện) |
| Hoàn nguyên code | giải nén `../sgk-app-backup-*.zip` đè lên `sgk-app/` |

Sau thay đổi (thư viện mở 12 giây, cùng máy): **21 MB** (chỉ tải bìa trang 1 của sách đang thấy)
thay vì 342 MB.


## Tài liệu

| File | Nội dung |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Kiến trúc hiện tại: nav/view/event/storage/IDB/integration/lifecycle |
| [`docs/TECHNICAL_DEBT.md`](docs/TECHNICAL_DEBT.md) | Nợ kỹ thuật: đã đóng / còn lại / có chủ đích + cách verify |
| [`docs/LEGACY_DEPRECATION.md`](docs/LEGACY_DEPRECATION.md) | Bảng phân loại legacy A/B/C + việc cần làm ở major tiếp theo |
| [`docs/AUDIO.md`](docs/AUDIO.md) | Hệ thống âm thanh: manager, event, settings, asset |
| [`docs/history/`](docs/history/) | **Baseline lịch sử** (Phase 8 audit/final report, Source Inventory) — số liệu cũ, chỉ để đối chiếu |

> 8 file báo cáo rời rạc ở root (APP_INTEGRATION_REPORT, ARCHITECTURE_AUDIT, PHASE8_*, SOURCE_INVENTORY,
> AUDIO_*, LEGACY_DEPRECATION) đã được gộp/và chuyển về `docs/` ngày 2026-09-30.
