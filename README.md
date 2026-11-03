# SGK Teacher Workspace

> Ứng dụng không gian làm việc dành cho giáo viên tiểu học: đọc và quản lý học liệu, soạn dạy, nghiên cứu, theo dõi công việc và tạo tài nguyên lớp học.

SGK Teacher Workspace là ứng dụng React chạy trên trình duyệt, có backend Node.js/Express để quản lý thư viện file và một số dịch vụ tích hợp. Dữ liệu cá nhân của ứng dụng được lưu trong trình duyệt; file sách được lưu trên máy chạy backend. Ứng dụng không tự đồng bộ dữ liệu lên cloud. Các tính năng Gemini, nhập nội dung từ URL và một số tài nguyên web cần kết nối Internet.

## Tính năng

- **Thư viện và đọc sách:** quản lý, lọc và đọc học liệu; lưu tiến độ, đánh dấu trang, ghi chú, từ vựng và tiếp tục đọc. Hỗ trợ PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, TXT, Markdown, HTML, EPUB và ảnh.
- **Soạn dạy:** giáo án/KHBD, hoạt động, phiếu học tập và ngân hàng câu hỏi; hỗ trợ chỉnh sửa, tạo nội dung và xuất tài liệu.
- **Nghiên cứu:** tìm kiếm trong thư viện, so sánh, ma trận, kiểm kê, thống kê ngôn ngữ, tài liệu tham khảo và bộ công cụ dữ liệu.
- **Công cụ lớp học:** bảng trắng, quét vùng trang/ảnh, OCR, đọc nội dung thành tiếng, trợ lý AI và tạo sơ đồ tư duy.
- **Quản lý công việc:** nhiệm vụ, ý tưởng, nhật ký thực tập và thống kê hoạt động.
- **Dữ liệu và trợ giúp:** sao lưu/khôi phục dữ liệu trình duyệt, quản lý thùng rác, cài đặt, trợ giúp và kho công cụ web.
- **PWA:** bản build có manifest và service worker; một số tài nguyên đã tải có thể dùng lại khi offline. Backend, file chưa cache và tính năng AI/Internet vẫn cần kết nối tương ứng.

## Công nghệ

| Phần | Công nghệ |
|---|---|
| Giao diện | React 19, Vite 8, Lucide React |
| Đọc PDF và PWA | PDF.js, vite-plugin-pwa/Workbox |
| Backend | Node.js, Express, multer, CORS |
| Lưu trữ trình duyệt | localStorage và IndexedDB |
| Tài liệu | `docx`, `mammoth`, `jszip`, `xlsx` |
| Chất lượng | oxlint, `node:test`, Playwright Core |

## Yêu cầu

- Node.js tương thích với Vite 8 (khuyến nghị Node.js 20.19+ hoặc 22.12+).
- npm đi kèm Node.js.
- Trình duyệt hiện đại. Các bài e2e có thể cần trình duyệt tương thích Playwright.

## Bắt đầu

Từ thư mục dự án:

```bash
npm ci
npm run dev:all
```

Mở địa chỉ frontend do Vite in ra, mặc định `http://127.0.0.1:5173`. Backend chạy ở cổng `5000`; Vite chuyển tiếp `/api` và `/lesson-images` tới backend. Nếu cổng mặc định đang được dùng, Vite có thể tự chọn cổng khác.

Để có sách trong thư viện, đặt file vào thư mục `books` cạnh thư mục `sgk-app` hoặc tải file qua giao diện. Backend tự tạo thư mục này nếu chưa có. Có thể đặt đường dẫn khác bằng biến `BOOKS_DIR`.

Chạy frontend và backend riêng trong hai terminal:

```bash
npm run dev:backend
npm run dev:frontend
```

Tải file sách được giới hạn tối đa 80 MB mỗi file. Tên file được dùng để suy ra một phần metadata như lớp, môn và tập; có thể chỉnh lại thông tin trong ứng dụng.

## Lệnh thường dùng

| Lệnh | Tác dụng |
|---|---|
| `npm run dev:all` | Chạy backend và Vite cùng lúc |
| `npm run dev:frontend` | Chạy riêng frontend Vite |
| `npm run dev:backend` | Chạy riêng backend Express |
| `npm run build` | Build frontend vào `dist/` |
| `npm run preview` | Xem thử bản build bằng Vite Preview |
| `npm start` | Chạy `server.js` |
| `npm run start:bg` | Khởi chạy backend nền trên Windows |
| `npm run lint` | Chạy oxlint |
| `npm test` | Chạy unit/integration tests bằng `node:test` |
| `npm run test:e2e` | Chạy các bài e2e trong `tests/e2e/` |

`npm run preview` phục vụ bản frontend đã build; khi cần API, cần chạy backend riêng. `npm start` chạy backend Express. Trong quy trình deploy GitHub Pages hiện tại, workflow chỉ build và deploy frontend tĩnh; API cần được cung cấp riêng nếu muốn bật các tính năng phụ thuộc backend.

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
