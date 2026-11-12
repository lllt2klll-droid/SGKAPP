# SGK Teacher Workspace

> Ứng dụng không gian làm việc dành cho giáo viên tiểu học: đọc và quản lý học liệu, soạn dạy, nghiên cứu, theo dõi công việc và tạo tài nguyên lớp học.

Trang chủ là landing page giới thiệu sản phẩm, tính năng, quyền riêng tư và lựa chọn cài đặt. Nút **Dùng ứng dụng web** mở không gian làm việc tại `/?app=1`; bản PWA cũng khởi động trực tiếp vào ứng dụng. Bản desktop Electron tiếp tục mở ứng dụng thay vì landing page.

SGK Teacher Workspace là ứng dụng React chạy trên trình duyệt, có backend Node.js/Express để quản lý thư viện file và một số dịch vụ tích hợp. Dữ liệu cá nhân của ứng dụng được lưu trong trình duyệt; file sách được lưu trên máy chạy backend. Ứng dụng không tự đồng bộ dữ liệu lên cloud. Các tính năng Gemini, nhập nội dung từ URL và một số tài nguyên web cần kết nối Internet.

## Tính năng

- **Thư viện và đọc sách:** quản lý, lọc và đọc học liệu; lưu tiến độ, đánh dấu trang, ghi chú, từ vựng và tiếp tục đọc. Hỗ trợ PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, TXT, Markdown, HTML, EPUB và ảnh.
- **Soạn dạy:** giáo án/KHBD, hoạt động, phiếu học tập và ngân hàng câu hỏi; hỗ trợ chỉnh sửa, tạo nội dung và xuất tài liệu.
- **Nghiên cứu:** tìm kiếm trong thư viện, so sánh, ma trận, kiểm kê, thống kê ngôn ngữ, tài liệu tham khảo và bộ công cụ dữ liệu.
- **Công cụ lớp học:** bảng trắng, quét vùng trang/ảnh, OCR, đọc nội dung thành tiếng, trợ lý AI và tạo sơ đồ tư duy.
- **Quản lý công việc:** nhiệm vụ, ý tưởng, nhật ký thực tập và thống kê hoạt động.
- **Dữ liệu và trợ giúp:** sao lưu/khôi phục dữ liệu trình duyệt, quản lý thùng rác, cài đặt, trợ giúp và kho công cụ web.
- **PWA:** bản build có manifest và service worker; một số tài nguyên đã tải có thể dùng lại khi offline. Backend, file chưa cache và tính năng AI/Internet vẫn cần kết nối tương ứng.
- **Website giới thiệu:** landing page responsive có hướng dẫn bắt đầu, thông tin lưu trữ dữ liệu, FAQ, nút mở ứng dụng, cài PWA và liên kết trang phát hành Windows.

## Công nghệ

| Phần | Công nghệ |
|---|---|
| Giao diện | React 19, Vite 8, Lucide React |
| Đọc PDF và PWA | PDF.js, vite-plugin-pwa/Workbox |
| Backend | Node.js, Express, multer, CORS |
| Bản desktop Windows | Electron, electron-builder |
| Lưu trữ trình duyệt | localStorage và IndexedDB |
| Tài liệu | `docx`, `mammoth`, `jszip`, `xlsx` |
| Chất lượng | oxlint, `node:test`, Playwright Core |

## Yêu cầu

- Node.js tương thích với Vite 8 (khuyến nghị Node.js 20.19+ hoặc 22.12+).
- npm đi kèm Node.js.
- Đóng gói `.exe`: Windows x64, Node.js và npm.
- Trình duyệt hiện đại. Các bài e2e có thể cần trình duyệt tương thích Playwright.

## Bắt đầu

Từ thư mục dự án:

```bash
npm ci
npm run dev:all
```

Mở địa chỉ frontend do Vite in ra, mặc định `http://127.0.0.1:5173`. Backend chạy ở cổng `5000`; Vite chuyển tiếp `/api` và `/lesson-images` tới backend. Nếu cổng mặc định đang được dùng, Vite có thể tự chọn cổng khác.

Địa chỉ gốc hiển thị landing page; nhấn **Dùng ứng dụng web** để mở ứng dụng. Có thể mở thẳng giao diện ứng dụng bằng cách thêm `?app=1` vào URL. Nút **Cài đặt ứng dụng** dùng lời nhắc cài PWA của trình duyệt khi khả dụng; nút Windows dẫn tới trang phát hành được khai báo trong `version.json`.

Để có sách trong thư viện, đặt file vào thư mục `books` cạnh thư mục `sgk-app` hoặc tải file qua giao diện. Backend tự tạo thư mục này nếu chưa có. Có thể đặt đường dẫn khác bằng biến `BOOKS_DIR`.

Chạy frontend và backend riêng trong hai terminal:

```bash
npm run dev:backend
npm run dev:frontend
```

Tải file sách được giới hạn tối đa 80 MB mỗi file. Tên file được dùng để suy ra một phần metadata như lớp, môn và tập; có thể chỉnh lại thông tin trong ứng dụng.

## Đóng gói ứng dụng Windows

Trên Windows, từ thư mục `sgk-app`, tạo bộ cài bằng:

```bash
npm ci
npm run dist:win
```

Nếu npm 12 báo đã chặn install script của Electron, cho phép script và cài runtime trước khi đóng gói:

```bash
npm install-scripts approve electron
npm rebuild electron
npm run dist:win
```

File cài đặt nằm trong `release/windows/` với tên `SGK-Teacher-Workspace-Setup-<version>.exe`; bản portable có tên `SGK Teacher Workspace Portable <version>.exe`. Tên file Setup khớp với URL trong `latest.yml` để trình tự cập nhật trong app có thể tải đúng artifact. Phiên bản lấy từ `package.json`. Nhấn đúp file Setup, hoàn tất trình cài đặt để tạo shortcut trên Desktop/Start Menu; ứng dụng sẽ tự mở sau cài đặt. Bộ cài dùng chế độ **theo từng người dùng** (cài vào `%LOCALAPPDATA%\Programs`), không yêu cầu quyền quản trị nên không hiện hộp thoại UAC. Máy cài ứng dụng không cần cài riêng Node.js. Muốn tạo bản portable, chạy `npm run dist:portable`. Lệnh `npm run desktop` build giao diện rồi chạy thử bản desktop trên máy phát triển.

### Bản desktop dùng ngay khi Windows chặn `.exe` (Smart App Control)

Windows 11 có thể bật **Smart App Control**: khi đó mọi `.exe` chưa ký đều bị chặn, kể cả bộ cài do `electron-builder` tạo (log Code Integrity ghi `An Application Control policy has blocked this file`). Nguyên nhân: `electron-builder` phải sửa exe để gắn icon và asar integrity, làm mất chữ ký gốc của Electron.

Cách chạy được trong trường hợp này là giữ nguyên `electron.exe` gốc của Electron (Windows đã biết file này) và đặt mã ứng dụng trong `resources/app.asar`:

```bash
npm run dist:local
```

Lệnh tạo thư mục `SGK Desktop` ở thư mục gốc dự án (ngang hàng `sgk-app`). Nhấn đúp `SGK Desktop\SGK Teacher Workspace.exe` — hoặc shortcut ngoài Desktop — để mở app đầy đủ tính năng, kể cả liên kết PDF gốc. Không được tách rời file `.exe` khỏi các file `.dll` trong cùng thư mục.

Dự phòng: `Chay_Desktop.bat` chạy trực tiếp `electron.exe` trong `node_modules` trỏ vào mã nguồn; cách này cần giữ `node_modules` và không có tự cập nhật.

Muốn bỏ hẳn việc chặn: tắt Smart App Control trong Windows Security (đã tắt thì không bật lại được nếu không cài lại Windows) hoặc ký số ứng dụng bằng chứng chỉ tin cậy; khi đó `npm run dist:win` tạo bộ cài per-user bình thường.


Ứng dụng đóng gói kèm `version.json` để hiển thị thông tin phát hành và kiểm tra phiên bản trực tuyến tại `https://raw.githubusercontent.com/lllt2klll-droid/book-update/main/version.json`. Bản Setup Windows hỗ trợ tải cập nhật trong ứng dụng và cài đặt sau khi người dùng khởi động lại. Bản Portable không thể tự thay thế tệp đang chạy; người dùng cần tải bản Portable mới từ trang Releases.

Khi phát hành phiên bản mới, đồng bộ phiên bản trong `package.json` và `version.json`. Đưa bộ cài Setup cùng `latest.yml` và các tệp `.blockmap` do `electron-builder` tạo ra vào cùng GitHub Release để trình cập nhật có thể tải và xác minh bản cài đặt. `version.json` tiếp tục cung cấp ngày phát hành và danh sách thay đổi hiển thị trong ứng dụng.

Bản cài đặt bắt đầu với thư viện trống; sách và ảnh trên máy phát triển **không được đóng gói vào file `.exe`**. Thư viện sách và ảnh giáo án do người dùng thêm được lưu riêng tại `%APPDATA%\SGK Teacher Workspace\books` và `%APPDATA%\SGK Teacher Workspace\lesson-images`. Dữ liệu trình duyệt như tiến độ đọc, cài đặt và IndexedDB được lưu riêng trong hồ sơ Electron tại `%APPDATA%\SGK Teacher Workspace`. Dữ liệu được giữ lại khi gỡ ứng dụng để tránh mất nội dung; khi chuyển sang máy khác, hãy sao chép thư mục dữ liệu này nếu muốn giữ cả thư viện lẫn dữ liệu ứng dụng.

Người dùng có thể thêm sách riêng sau khi cài bằng chức năng nhập trong ứng dụng. Có thể chọn hoặc kéo-thả **nhiều file cùng lúc** (tối đa 60 file mỗi lần) để mở bảng thêm hàng loạt, sửa tiêu đề từng file và theo dõi tiến trình. Ở bản desktop, khi các file đã chọn đều là PDF trên máy, có thể chọn **“Chỉ liên kết file gốc”** cho cả loạt để đọc trực tiếp mà không sao chép vào `books/`; cần giữ nguyên vị trí file gốc, nếu file bị di chuyển/đổi tên thì sách sẽ không mở được.

Khi đóng cửa sổ cuối cùng, ứng dụng desktop sẽ dừng máy chủ nội bộ và giải phóng cổng; máy chủ không tiếp tục chạy nền khi ứng dụng đã thoát.

## Lệnh thường dùng

| Lệnh | Tác dụng |
|---|---|
| `npm run dev:all` | Chạy backend và Vite cùng lúc |
| `npm run dev:frontend` | Chạy riêng frontend Vite |
| `npm run dev:backend` | Chạy riêng backend Express |
| `npm run build` | Build frontend vào `dist/` |
| `npm run desktop` | Build và chạy ứng dụng desktop Electron |
| `npm run dist:win` | Tạo bộ cài Windows trong `release/windows/` |
| `npm run dist:portable` | Tạo bản portable Windows trong `release/windows/` |
| `npm run preview` | Xem thử bản build bằng Vite Preview |
| `npm start` | Chạy `server.js` |
| `npm run start:bg` | Khởi chạy backend nền trên Windows |
| `npm run lint` | Chạy oxlint |
| `npm test` | Chạy unit/integration tests bằng `node:test` |
| `npm run test:e2e` | Chạy tuần tự các bài e2e trong `tests/e2e/` để tránh tranh chấp browser/server giữa spec |

`npm run preview` phục vụ landing page và ứng dụng web đã build; khi cần API, cần chạy backend riêng. `npm start` chạy backend Express. Trong quy trình deploy GitHub Pages hiện tại, workflow chỉ build và deploy frontend tĩnh; API cần được cung cấp riêng nếu muốn bật các tính năng phụ thuộc backend.

## Cấu hình

Các biến môi trường tùy chọn:

| Biến | Dùng ở đâu | Tác dụng |
|---|---|---|
| `PORT` | Backend | Cổng Express, mặc định `5000` |
| `BOOKS_DIR` | Backend | Thư mục lưu file thư viện; mặc định backend dò `../books` trước |
| `ALLOWED_HOSTS` | Backend | Bổ sung hostname được phép truy cập backend, phân cách bằng dấu phẩy |
| `WRITE_TOKEN` | Backend | Bật xác thực cho thao tác ghi/xóa khi backend được mở rộng ra ngoài máy cá nhân |
| `VITE_API_BASE_URL` | Build frontend | Địa chỉ API khi frontend và backend không cùng origin |
| `BASE_PATH` | Build frontend | Đường dẫn gốc khi deploy dưới một subpath; workflow Pages dùng `/SGKAPP/` |

Không commit token hoặc khóa API vào repository. `WRITE_TOKEN` cần được cấu hình phù hợp cả ở server lẫn phía client theo `src/services/apiConfig.js`. Trợ lý AI cần Gemini API key; cấu hình trong phần Cài đặt của ứng dụng. Yêu cầu AI được gửi qua backend tới Gemini, vì vậy nội dung được chọn làm ngữ cảnh AI sẽ rời khỏi máy để xử lý bởi dịch vụ bên ngoài.

## Dữ liệu và sao lưu

- Cài đặt và dữ liệu nhẹ được lưu trong localStorage; dữ liệu lớn, chỉ mục và ảnh/blob được lưu trong IndexedDB của trình duyệt.
- File sách nằm trên ổ đĩa của máy chạy backend, mặc định ở `../books` so với thư mục dự án.
- Tính năng sao lưu trong ứng dụng dành cho dữ liệu trình duyệt. Hãy sao lưu riêng thư mục sách (`books/`) và giữ file backup ở nơi an toàn.
- Xóa dữ liệu trình duyệt, xóa hồ sơ trình duyệt hoặc đổi trình duyệt có thể làm mất dữ liệu local chưa được xuất backup.
- Không có tài khoản hay đồng bộ cloud tích hợp sẵn. Nếu tự triển khai backend cho nhiều thiết bị hoặc qua mạng, hãy giới hạn truy cập và cấu hình xác thực ghi/xóa trước khi sử dụng.

## Cấu trúc dự án

```text
sgk-app/
├── server.js             # Express API và phục vụ thư viện file
├── server/               # Bảo vệ request và kiểm thử backend
├── vite.config.js        # Vite, PWA, proxy và cấu hình build
├── public/               # Icon, âm thanh và tài nguyên tĩnh
├── src/
│   ├── App.jsx           # Vỏ ứng dụng, điều hướng và trạng thái chính
│   ├── core/             # Registry điều hướng/view, event bus, storage keys
│   ├── views/            # Các màn hình chức năng
│   ├── khbd/             # Soạn giáo án/KHBD
│   ├── reader/            # Thành phần đọc sách
│   ├── scan/              # Quét ảnh và xử lý scan
│   ├── whiteboard/        # Bảng trắng và dữ liệu liên quan
│   ├── audio/             # Âm thanh giao diện
│   ├── services/          # API và dịch vụ ứng dụng
│   └── safeStorage.js     # Tiện ích lưu trữ trình duyệt an toàn
├── tests/e2e/             # Kiểm thử end-to-end
└── docs/                  # Tài liệu kỹ thuật
```

## Kiến trúc tóm tắt

- `src/core/navigationRegistry.js` và `src/core/viewRegistry.js` là nguồn cấu hình điều hướng và màn hình.
- `src/core/appEvents.js` cung cấp event bus dùng chung giữa các module.
- Dữ liệu trình duyệt được chia theo kích thước/loại: localStorage cho dữ liệu nhẹ, IndexedDB cho dữ liệu lớn, ảnh và chỉ mục.
- Backend Express quản lý file sách, nội dung văn bản và các API tích hợp. Vite proxy API tới backend khi phát triển.
- Các màn hình được đăng ký tập trung và phần lớn tải lười để giảm lượng mã tải ban đầu.

## Tài liệu khác

| Tài liệu | Nội dung |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Kiến trúc, điều hướng, event, lưu trữ và vòng đời dữ liệu |
| [docs/TECHNICAL_DEBT.md](docs/TECHNICAL_DEBT.md) | Nợ kỹ thuật và các hạng mục theo dõi |
| [docs/LEGACY_DEPRECATION.md](docs/LEGACY_DEPRECATION.md) | Phân loại và kế hoạch loại bỏ thành phần legacy |
| [docs/AUDIO.md](docs/AUDIO.md) | Thiết kế hệ thống âm thanh |
| [docs/history/](docs/history/) | Báo cáo và baseline lịch sử; không phải trạng thái kiểm thử hiện tại |

## Giấy phép

Repository hiện khai báo `UNLICENSED` trong `package.json`. Hãy xin phép chủ sở hữu trước khi phân phối hoặc sử dụng lại mã nguồn.
