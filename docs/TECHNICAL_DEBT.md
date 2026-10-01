# TECHNICAL DEBT — SGK Teacher Workspace

> Cập nhật **2026-10-01**. Gộp bảng nợ của `PHASE8_FINAL_INTEGRATION_REPORT §12/§13`,
> `LEGACY_DEPRECATION.md` và `AUDIO_SYSTEM_REPORT §15`.
> Số liệu Phase 8 (2026-09-13): `docs/history/PHASE8_*`.

## 0. Cách kiểm chứng lại

```bash
npm run lint        # oxlint  → hiện 0 warnings / 0 errors (179 files, 89 rules)
npm test            # node:test → hiện 329 pass / 0 fail (57 suites)
npm run build       # Vite → 1994 modules, PWA precache 78 entries, 0 cảnh báo
npm run test:e2e    # playwright-core → 24/24 (5 spec, cần dist/)
```

Đếm nợ bằng grep (ngoại trừ `*.test.*`, các module được phép `safeStorage/storage/indexedDB/storageHealth`):

```powershell
Get-ChildItem -Recurse src -Include *.js,*.jsx |
  Where-Object { $_.Name -notlike '*.test.*' -and $_.Name -notin @('safeStorage.js','storage.js','indexedDB.js','storageHealth.js') } |
  Select-String 'localStorage\.'
(Get-ChildItem -Recurse src -Include *.js,*.jsx | Where-Object Name -ne 'appEvents.js' |
  Select-String 'window\.dispatchEvent').Count
```

---

## 1. Đã đóng (có bằng chứng)

| Nợ (tên gọi cũ trong báo cáo) | Bằng chứng đóng |
|---|---|
| `deleteBoard` chưa purge blob `wb_images` | `whiteboardStore.purgeOrphanImageBlobs()` gọi trong `deleteBoard/deleteBoardAsync` + `imageStore.purgeUnreferencedImageBlobs` — có test `tests/whiteboardRefIntegrity.test.js` |
| `delete book` chưa purge Whiteboard refs | `storage.removeBookData` → dynamic import `whiteboardStore.purgeBookRefs(file)` (bỏ qua khi IDB không khả dụng); `migrateBookData` → `migrateBookRefs(old,new)` |
| 117 direct `localStorage.*` (17 file) | còn **4 hit code** (chẩn đoán `SettingsCenter`) + 4 comment. Cụ thể: `dataIntegrity 0`, `syncService 0`, `relatedData 0`, `khbdAutosaveEngine` **đã xoá file** (autosave đi qua `khbd/planModel.js`), `AssistantBubble/BookReader/StructuredNotes/searchIndex/tocData` → `safeStorage` |
| 60 `window.dispatchEvent`, 18 file `new CustomEvent("sgk:...")` viết tay | ngoài `core/appEvents.js`: **0** (1 dòng comment). 23 file gọi `appEvents.emit`; 10/11 fake `new Event("storage")` xoá sạch → **0 hit** |
| Niche events chưa vào enum (`open-word-editor/filter-subject/sync-status`) | đã thêm `OPEN_WORD_EDITOR`, `FILTER_SUBJECT`, `SYNC_STATUS_UPDATED` vào `AppEvents` + chuyển emitter sang bus |
| `subscribeSettings` double-fire | chỉ subscribe bus (bỏ listener window trùng) |
| `App.jsx` danh sách id render (21 id viết tay `registryViews`) | xoá — render theo `getViewEntry(view).component`; `fallbackLabels` duplicate → dùng `entry.label` |
| File chết: `Navigation.jsx`, `navigationConfig.js` (2 bản), `UtilityBubble` cache… | đã xoá sau khi xác nhận 0 importer |
| Lint 9 warnings | đã fix: tách `components/fileDropzoneUtils.js`, bỏ `export` thừa, bỏ nhánh `if (id==="stats" && false)`, xoá `getWebToolsCount()` chết → **0 warnings** |
| `storage.js` duplicate `BACKUP_KEYS/CACHE_PREFIXES` | re-export từ `core/storageKeys` (`export const BACKUP_KEYS = _BACKUP_KEYS_CORE`) |
| Vendor chunk 1,3 MB | `vite.config.js` tách `vendor-xlsx` 424 kB, `vendor-docx` 378 kB, `vendor-jszip` 96 kB, `vendor-mammoth` 55 kB → `vendor` còn **352 kB** |
| Âm thanh placeholder "1605 bytes silent MP3" | asset thật `public/audio/ui/*.wav` (3–10 KB, đã kiểm byte không phải silent) + `SYNTH_PRESETS` WebAudio; xoá 11 file `.mp3` trùng không tham chiếu → xem `docs/AUDIO.md` |
| `viewRegistry` thiếu `keywords/related` | đã bổ sung cho mọi view; `App.jsx` render nhánh lazy qua registry |
| Xoá sách = mất vĩnh viễn, không lấy lại được | **A2** — `src/trashStore.js` + `src/trashPurge.js`: soft-delete 30 ngày (`sgk_trash` trong `BACKUP_KEYS`), file PDF chưa bị đụng tới; card Thùng rác + badge đỏ ở footer nav trong DataTools/App; `deletePlan/deleteQuestion` đi qua thùng rác |
| Không có sao lưu tự động, không biết "đã sao lưu lúc nào" | **A3** — `src/autoBackup.js` (IndexedDB riêng `SGKAutoBackup`, bỏ stores ảnh để bản chụp nhẹ), toggle + chu kỳ + số bản ở Cài đặt → Sao lưu, pill trạng thái trên Dashboard, nút "Sao lưu ngay" ở banner A1 |
| Không cảnh báo khi trình duyệt sắp hết bộ nhớ | **A1** — banner `dash-notice` đọc `navigator.storage.estimate()` (≥90% cảnh báo, ≥98% báo nguy), poll 5 phút, có nút Sao lưu ngay / Dọn & Khôi phục / Đóng (dismiss theo mức) |
| Class `đanger` (đ U+0111) + nút Xóa bị CSS ép thành xanh dương | **A4** — normalize thành `.btn-danger` ở 5 chỗ trong `App.jsx`; `20-polish-textbookmodal.css` ép `.btn:not(.btn-danger)` → xanh `!important` nên phải dùng đúng class đỏ |
| Build phát 2 cảnh báo `INEFFECTIVE_DYNAMIC_IMPORT` | xoá import `HelpView` chết ở `App.jsx` + bỏ `await import("storageHealth")` trùng (đã static import ở đầu file) trong `DataToolsView` → build 0 cảnh báo |
| Modal xác nhận xóa: focus mặc định vào nút nguy hiểm, thiếu Escape | `autoFocus` chuyển sang nút **Hủy** (App + WebToolbox), thêm `onKeyDown Escape`; thông báo đưa sách vào thùng rác có nút **Hoàn tác** 6 giây |
| A1–A3 không có test (mới thêm mà không ai giữ) | **C** — `src/trashStore.test.js` (16 test: TTL 30 ngày, cap 300, event `{source,type}`, lifecycle xóa→khôi phục của giáo án/câu hỏi, purge gọi API `DELETE` đúng file, sao lưu tự động) + `src/storageNotice.test.js` (6 test ngưỡng 90/98%). Đổi số test 286 → **316** |
| Logic ngưỡng A1 hard-code trong `checkStorageQuota` → không test được | tách thuần ra `src/storageNotice.js` (`storageNoticeLevel` + `storageNoticeText`), `App.jsx` chỉ đọc `estimate()` rồi gọi |
| Không ai bấm thử chu trình xuất/khôi phục file sao lưu | **F** — thêm `tests/e2e/backup.spec.js` 4 test: ghim sách → **Xuất file** (bắt `download`, JSON có `app/schemaVersion/data.sgk_favs`) → **Xóa toàn bộ** (bắt bản `auto-recovery-before-wipe` + dữ liệu người dùng sạch) → **Khôi phục từ file** (preview hiện, nút xác nhận bị khóa đến khi tick, `location.reload()` → `sgk_favs` quay lại, sao sáng trên bìa). Port 5323 + `BOOKS_DIR` thư mục tạm. E2E: 10 → **14/14** |
| Không ai bấm thử bảng trắng & quét ảnh | **G** — thêm `tests/e2e/board-scan.spec.js` 7 test: mở canvas, tạo bảng mới, vẽ khối + lưu tay, reload còn dữ liệu (đọc `whiteboard_boards`), mở sách → Quét vùng → đúp chọn trang → modal mở + `sgk_scans_v1` có ảnh crop, Escape đóng. PDF test **dựng đúng xref** cho pdf.js. Gỡ flaky của G7 bằng `focus()` vào nút X trước khi bấm Escape. E2E: 14 → **21/21** (4 spec × 4 port) |
| Mở 2 tab mà tab B không biết tab A vừa tạo bảng trắng (kho IndexedDB không có event `storage`) | **Cross-tab** — thêm `src/core/crossTab.js` (BroadcastChannel `sgk:bus`, whitelist 10 event **dữ liệu**) + `appEvents.emit → publishCrossTab`, tab nhận chạy lại `emitLocal` với `_remoteDispatchDepth > 0` (không ping-pong) và bỏ qua `from === SENDER_ID` / `detail.source === "cross-tab-sync"`. Unit 13 test + e2e `tests/e2e/cross-tab.spec.js` 3 test (A tạo bảng → B nhận, B vẫn ở Dashboard, chiều ngược lại) |
| E2E chỉ 3 test (1 spec file) — lifecycle mới không ai bấm thử | **D** — thêm `tests/e2e/trash.spec.js` 7 test: vào thùng rác → badge đỏ → khôi phục → nút Hoàn tác 6s → "Xóa ngay" xóa file thật (API + ổ đĩa) → banner bộ nhớ 98%. Chạy port 5322 + `BOOKS_DIR` trỏ thư mục tạm `os.tmpdir()` → **không đụng thư mục sách thật**, 2 spec song song không giành cổng. E2E: 3 → **10/10** |
| `core/storageAdapter.js`, `core/appContext.js`, `core/integration.js` — **0 importer thật**, 471 dòng chết | **E** — grep toàn dự án trước khi xoá (kể cả `whiteboardIntegration` chỉ *nhắc* hub trong **comment**, không import); copy sang `docs/_attic/src-core/` rồi gỡ khỏi `src/core/` (repo không có git). `src/core/` còn **7 module, mọi module ≥1 importer**. Đổi `ARCHITECTURE.md §2/§5/§9/§12/§13/§14` + `LEGACY_DEPRECATION.md` |

## 2. Nợ còn lại (open)

| Nợ | Mức độ | Lý do / kế hoạch |
|---|---|---|
| 5 view inline trong `App.jsx` (`library, continue, marks, vocab, stats`) | Thấp — **có chủ đích** | phụ thuộc state/closures của App (bộ lọc, history, bookmarksMap, vocabList, quiz stats); `viewRegistry` đã ghi `component: null` + chú thích. Tách component + truyền props nếu muốn gộp về 1 vòng render |
| 4 hit `localStorage.*` trong `SettingsCenter.jsx` (chẩn đoán) | Thấp — **có chủ đích** | probe raw lúc quét tình trạng bộ nhớ (phải đọc thẳng để đo). Giữ + chú thích |
| Legacy B còn giữ: `sgk_theme` (8 hit), `sgk_lessonPlans` (3), `SKG_TEACHER_MODE` (1), `imageStore.SGKWhiteboardDB` (2) | Thấp — **đã đánh giá 2026-10-01: giữ** | `sgk_lessonPlans`/`sgk_lessonplans` **vẫn được đọc** (`App.jsx:629`, `missionStore`, `khbd/planModel.OLD_KEYS`) nên phải nằm trong `BACKUP_KEYS`; `imageStore` legacy không chỉ là compat mà còn là **fallback khi ghi IDB lỗi** (`persistBoard`/`createBoard`). Xem `LEGACY_DEPRECATION.md` |
| `window` bridge trong `core/appEvents.js` (5 dòng dispatch) | Đã đóng 2026-10-01 | bridge giữ nguyên cho listener legacy **in-tab** (`window.addEventListener("sgk:*")`); việc **cross-tab** đã chuyển sang `core/crossTab.js` (BroadcastChannel) — xem §3 |
| `syncService` `LOCAL_SIMULATION` (6 hit) | Cố ý | spec: **không** biến thành cloud sync giả — để nguyên |
| `sgk:data-updated` catch-all (~45 chỗ emit/listen) | Thấp | design: event domain riêng vẫn bắn catch-all để Dashboard/DataTools refresh. Có thể giảm dần bằng listener theo domain |
| Khối lượng unit test 316 nhưng lệch báo cáo cũ (303 test/76 suites ở Phase 8) | Thông tin | bộ test đã được sắp lại/gộp — số hiện hành là **329/57** là số đúng |

## 3. Việc cần làm ở major tiếp theo

- [x] **Đánh giá 2026-10-01 — giữ, không xoá** `sgk_lessonPlans` / `sgk_theme` / `SKG_TEACHER_MODE`
      khỏi `BACKUP_KEYS`: `sgk_lessonplans*` **còn được đọc thật** (`App.jsx` gộp kho cũ, `missionStore`
      đếm, `khbd/planModel.OLD_KEYS` migrate) → xoá khỏi `BACKUP_KEYS` là **mất bản sao lưu** dữ liệu
      người dùng đang còn hiệu lực. `sgk_theme` đã migrate sang `settings.appearance.theme` nhưng xoá key
      cũ sẽ làm backup cũ restore về **không còn nơi chứa**. Giữ tới khi không còn key nào đọc lại.
- [x] **Đánh giá 2026-10-01 — giữ, không xoá** fallback `SGKWhiteboardDB` trong `whiteboard/imageStore.js`:
      không chỉ là "đọc DB cũ" mà còn là **nhánh dự phòng khi ghi vào `SGKAppDB` thất bại**
      (`writeImage`/`deleteImage` fallback khi `idbPut` lỗi). Xoá = mất khả năng ghi ảnh khi IDB lỗi.
- [x] **Đóng 2026-10-01 — cross-tab thật bằng `BroadcastChannel`**: thêm `src/core/crossTab.js`
      (kênh `sgk:bus`, whitelist 10 event dữ liệu) + `appEvents.emit` publish sang tab khác,
      tab nhận chạy lại `emitLocal` với `_remoteDispatchDepth > 0` → không ping-pong;
      `window` bridge cũ **giữ** cho listener legacy in-tab.
      Bảo chứng: unit `src/core/appEventsCrossTab.test.js` (9) + `src/core/crossTabNoChannel.test.js` (4)
      và e2e `tests/e2e/cross-tab.spec.js` (3): tab A tạo bảng trắng → tab B nhận
      `sgk:whiteboard-updated` (IndexedDB, `storage` event không cover được) → tab B **không** bị nhảy view;
      chiều ngược lại cũng chạy.
- [ ] (tuỳ chọn) Đưa 5 view inline vào `viewRegistry` bằng cách tách component riêng —
      **chưa làm**: phải truyền 5 nhóm state/closures của `App` (bộ lọc thư viện, history,
      bookmarksMap, vocabList, quiz stats) → lợi ích render không bù được rủi ro; giữ `component: null`.
- [x] Lifecycle xoá/backup/restore đã có **unit test** (`src/trashStore.test.js`, `src/storagePhase6.test.js`).
- [x] **E2E** cho lifecycle thùng rác: `tests/e2e/trash.spec.js` — vào thùng rác → badge → khôi phục → hoàn tác → xóa file thật, cộng cảnh báo bộ nhớ 98%.
      Chạy trên server riêng với `BOOKS_DIR` trỏ vào thư mục tạm trong `os.tmpdir()` nên **không đụng thư mục sách thật**.
- [x] **E2E** cho backup/restore **bằng file**: `tests/e2e/backup.spec.js` — ghim sách → xuất `.json` →
      wipe (kèm tải bản khẩn `auto-recovery-before-wipe`) → khôi phục từ chính file đó → dữ liệu quay lại.
- [x] **E2E** cho **bảng trắng** + **quét ảnh**: `tests/e2e/board-scan.spec.js` — tạo bảng mới (toast + số bảng tăng),
      vẽ khối → Lưu ngay → reload → còn trong `whiteboard_boards`; mở sách → Quét vùng → đúp chọn cả trang →
      modal mở + ảnh crop đã ghi `sgk_scans_v1` → Escape đóng modal.
      PDF dùng trong test được **dựng đúng xref** để pdf.js render được canvas (file rác sẽ làm crop thất bại).
- [x] E2E: **24/24** trên **5 spec** (smoke 5321, trash 5322, backup 5323, board-scan 5324,
      cross-tab 5325) — mỗi spec 1 port + 1 `BOOKS_DIR` tạm riêng → chạy song song không giành cổng,
      không đụng thư mục sách thật.

## 4. Cam kết kỹ thuật

- Không rewrite, không xoá chức năng, không tạo architecture song song thứ hai.
- Mọi migration: `legacy → detect → migrate → verify → canonical`; dữ liệu cũ đọc được.
- Bốn lệnh `lint / test / build / test:e2e` phải xanh trước khi nhận thay đổi.
