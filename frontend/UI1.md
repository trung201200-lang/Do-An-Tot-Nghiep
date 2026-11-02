# UI 1 — Nền tảng giao diện IT Helpdesk AI

Phạm vi: chỉ frontend. Không đổi API, backend, cơ sở dữ liệu hoặc RAG.
Không thêm dependency. SVG giao diện được vẽ trong component, không tải font/ảnh bên ngoài.

## Đã triển khai

- AppShell với sidebar navy, header, vùng nội dung, lối tắt bỏ qua menu.
- Tổng quan là màn hình đầu sau đăng nhập: chào người dùng, lối tắt chức năng thật,
  trạng thái đang xây dựng cho thống kê; không có số liệu mẫu.
- Menu Quản lý người dùng chỉ dành ADMIN và hiện placeholder rõ ràng. Khi quyền
  đổi qua `/auth/me`, menu và màn hình quản trị được ẩn khỏi người không còn quyền.
- Trang đăng nhập riêng, tiếng Việt, nút hiện/ẩn mật khẩu; giữ handler đăng nhập cũ.
- Button, Badge, Alert, LoadingState, EmptyState và Icon tái sử dụng.
- CSS tokens và bố cục responsive; dưới 901px dùng drawer với Escape, focus trap,
  trả focus và khóa tương tác nền khi menu mở. Hỗ trợ reduced motion.
- CSS cho ba màn hình nghiệp vụ cũ, giữ nguyên JSX và handler nghiệp vụ.

Các file `Tickets.jsx`, `KnowledgeBase.jsx`, `RagAssistant.jsx`, `api.js` không đổi.
Giữ sessionStorage, `/auth/login`, `/auth/me`, kiểm tra phiên khi focus/60 giây,
xử lý 401, logout và điều kiện quyền hiện có.

## Kiểm tra an toàn

Trong thư mục frontend:

```powershell
npm run build
npm run test:ui1
```

Test dùng Edge/Chrome đã cài trên Windows và WebSocket của Node 22, không cài thêm
package, không đọc `.env` hoặc tài khoản thật. Runner mở bản build bằng HTTP server
riêng trên loopback/cổng tự cấp và một profile trình duyệt headless riêng.
Mọi request API được chặn tại CDP Fetch và trả fixture; request ngoài phạm vi bị
chặn. Không gọi backend/database/model thật. Dữ liệu giả chỉ nằm trong script test,
không được import vào ứng dụng. Runner tự đóng trình duyệt/server khi kết thúc.
Ảnh và profile kiểm thử nằm trong `node_modules/.cache/ui1-check/`, được Git ignore.

22 nhóm kiểm tra: login tiếng Việt và nút hiện/ẩn; điều hướng/quyền Ticket/KB/RAG
và logout cho EMPLOYEE/IT/ADMIN; RAG fallback; hạ quyền ADMIN; khôi phục phiên và
401; lỗi xác minh phiên và retry; mobile drawer/focus/Escape/Tab; lỗi RAG giả lập;
không tràn ngang tại desktop 1440px/mobile 390px và kiểm tra RAG ở 320px; không có
exception trình duyệt hoặc request API ngoài fixture. Đây không phải kiểm thử tích
hợp backend thật hay chứng minh lại chất lượng RAG.

## Kiểm tra website thủ công

Nếu Vite đang chạy, tải lại http://127.0.0.1:5173. Nếu chưa chạy, dùng `npm run dev`
trong frontend. Backend hiện có cần đang hoạt động để dùng tài khoản thật.

1. Đăng nhập bằng tài khoản của bạn; kiểm tra Tổng quan, thông tin vai trò, đăng xuất.
2. EMPLOYEE có 4 menu; ADMIN có thêm Quản lý người dùng. IT/ADMIN giữ thao tác
   quản lý Ticket/KB; EMPLOYEE chỉ có các quyền sẵn có.
3. Mở danh sách/chi tiết Ticket, danh sách/chi tiết KB, trang Trợ lý AI; kiểm tra
   form, nội dung dài, loading và lỗi. Các thao tác tạo/sửa thật vẫn ghi dữ liệu
   theo API cũ, chỉ thực hiện khi chủ động muốn thay đổi dữ liệu.
4. Thu cửa sổ xuống 390px: mở menu, chọn chức năng, đóng bằng Escape hoặc nền mờ.
5. Kiểm tra keyboard Tab và focus; trang không bị tràn ngang, ngoại trừ vùng bảng
   có thanh cuộn riêng khi cần.

## Chưa thuộc UI 1

- Dashboard thống kê và giao diện CRUD người dùng.
- Routing theo URL/deep link, bộ lọc/phân trang Ticket, thiết kế lại chi tiết nghiệp vụ.
- Mở nguồn RAG, lịch sử hội thoại, điền sẵn form Ticket từ RAG.
- Giữ draft khi đổi menu. CTA từ RAG vẫn chuyển tới Ticket như trước, không tự tạo.

Chưa commit/push. Các thay đổi backend từ giai đoạn trước không thuộc UI 1.
