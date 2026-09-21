# Hệ thống hỗ trợ CNTT nội bộ

Quản lý yêu cầu hỗ trợ và tra cứu sự cố CNTT nội bộ ứng dụng RAG.

Đã hoàn thành Giai đoạn 1–3: khởi tạo hệ thống, Users/Login/JWT/RBAC và Ticket Management. Chưa triển khai Knowledge Base hoặc RAG.

## Công nghệ và cấu trúc

- Frontend: React, Vite, CSS; dùng state đơn giản, không có Redux.
- Backend: Node.js, Express 5, cors, dotenv, mysql2, bcrypt, jsonwebtoken; nodemon cho development.
- MySQL Server có sẵn; quản lý bằng MySQL Workbench. Không cần cài MySQL mới, XAMPP hoặc Docker.
- Môi trường đã dùng ở Giai đoạn 1: Node.js 22.17.1, npm 10.9.2.

```text
frontend/src/          Giao diện đăng nhập, trang chính, gọi API
backend/src/config/    Cấu hình môi trường, MySQL, JWT
backend/src/controllers/ Xử lý auth và quản lý user
backend/src/models/    Truy vấn users bằng tham số
backend/src/middleware/ Kiểm tra đăng nhập, quyền và xử lý lỗi
backend/src/routes/    Định tuyến health/auth/users/test
backend/src/utils/     Validation và seed tài khoản
backend/server.js      Khởi động server
database/              SQL chạy trong MySQL Workbench
docs/                  Hướng dẫn và kết quả kiểm thử
```

## Chuẩn bị database trong MySQL Workbench

1. Kết nối MySQL Server local `127.0.0.1:3306`, tài khoản `root`.
2. Database `it_support_rag` đã được tạo ở Giai đoạn 1. File `01_create_database.sql` dùng khi thiết lập lần đầu.
3. Mở và chạy **database/02_create_users.sql** bằng nút Execute trong Workbench.
4. Refresh Schemas để kiểm tra bảng `users`.

File SQL chỉ tạo users nếu chưa tồn tại, không xóa database, bảng hoặc dữ liệu. Nếu users đã tồn tại nhưng cấu trúc khác, cần kiểm tra cấu trúc trước; CREATE TABLE IF NOT EXISTS không tự sửa bảng cũ.

| Cột | Kiểu và ý nghĩa |
|---|---|
| id | INT, khóa chính, tự tăng |
| name | VARCHAR(100), bắt buộc |
| email | VARCHAR(254), bắt buộc, duy nhất |
| password | VARCHAR(255), chỉ lưu hash bcrypt |
| role | ENUM: EMPLOYEE, IT, ADMIN; mặc định EMPLOYEE |
| status | ENUM: ACTIVE, INACTIVE; mặc định ACTIVE |
| created_at | TIMESTAMP, tự ghi khi tạo |
| updated_at | TIMESTAMP, tự cập nhật khi sửa |

## Cấu hình local

Giữ nguyên cấu hình MySQL đang hoạt động trong `backend/.env`. File mẫu là `backend/.env.example`; nếu tạo mới từ mẫu, hãy tự điền thông tin local và khóa ký JWT ngẫu nhiên dài ít nhất 32 ký tự. File local đã được bổ sung khóa ký development nếu chưa có; thời hạn token mặc định là một ngày.

Mật khẩu và khóa ký thật chỉ nằm trong file local, không đưa vào mã nguồn, tài liệu hoặc Git. `.gitignore` bỏ qua `.env` và các biến thể, cho phép `.env.example`.

Biến `SEED_USER_PASSWORD` trong file local là mật khẩu dùng chung cho ba tài khoản demo. Bạn có thể tự đổi trước lần seed đầu. Mật khẩu ít nhất 8 ký tự, tối đa 72 byte UTF-8. Seed không thay mật khẩu tài khoản đã tồn tại. Chỉ sử dụng tài khoản seed ở môi trường local/demo.

Khởi động lại backend sau khi sửa cấu hình môi trường.

## Cài đặt và chạy

Terminal thứ nhất, từ thư mục gốc:

```powershell
cd backend
npm.cmd install
npm.cmd run seed:users
npm.cmd run dev
```

Chỉ chạy seed sau khi chạy SQL tạo users. Script kiểm tra email, bỏ qua tài khoản có sẵn, hash bằng bcrypt với cost 12 rồi insert. Không tự tạo bảng hoặc xóa dữ liệu. Có thể dùng `npm.cmd start` để chạy backend không có nodemon.

Terminal thứ hai, từ thư mục gốc:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

- Frontend: http://127.0.0.1:5173
- Backend: http://127.0.0.1:5000
- Kiểm tra server: http://127.0.0.1:5000/api/health
- Kiểm tra MySQL: http://127.0.0.1:5000/api/health/db

Trong thư mục frontend, dùng `npm.cmd run build` để build hoặc `npm.cmd run preview` để xem bản build. Dùng Ctrl+C để dừng server.

## Tài khoản demo và đăng nhập

| Email | Role |
|---|---|
| employee@test.local | EMPLOYEE |
| it@test.local | IT |
| admin@test.local | ADMIN |

Các tài khoản mới có trạng thái ACTIVE. Mật khẩu là giá trị bạn đặt cho seed trong file local tại thời điểm tạo tài khoản. Sau seed, mở frontend, nhập email/mật khẩu để đăng nhập, xem tên và vai trò, rồi dùng Đăng xuất để xóa phiên.

Frontend lưu token trong sessionStorage (theo từng tab), thông tin user trong React state. Khi tải lại trang, frontend gọi `/api/auth/me` trước khi hiển thị trang chính. Token sai/hết hạn bị xóa; lỗi mạng cho phép thử lại. Phiên được kiểm tra lại khi quay lại tab và định kỳ một phút. sessionStorage là lựa chọn đơn giản cho demo; không lưu mật khẩu tại trình duyệt và không chèn HTML không tin cậy.

## Authentication, JWT và RBAC

1. Login chuẩn hóa email, kiểm tra ACTIVE và so sánh mật khẩu bằng bcrypt.
2. Backend ký JWT bằng HS256, có ID user và hạn dùng, không chứa mật khẩu. JWT được ký để kiểm tra tính toàn vẹn, không phải dữ liệu mã hóa.
3. Client gửi `Authorization: Bearer <token>`.
4. Middleware xác minh chữ ký và hạn token, đọc user hiện tại trong MySQL, kiểm tra ACTIVE rồi gắn vào req.user.
5. RBAC kiểm tra role từ database ở backend. Việc thay role/status có hiệu lực ở yêu cầu tiếp theo dù token cũ chưa hết hạn.

Đăng xuất xóa token phía trình duyệt; chưa có danh sách thu hồi token. ADMIN đổi role/status qua các API quản lý tài khoản. Trang chính có thông tin người dùng và quản lý Ticket; chưa có biểu mẫu quản trị tài khoản.

## API

| Method | Đường dẫn | Quyền |
|---|---|---|
| GET | /api/health | Công khai |
| GET | /api/health/db | Công khai |
| POST | /api/auth/login | Công khai |
| GET | /api/auth/me | User ACTIVE có JWT hợp lệ |
| GET | /api/test/employee | EMPLOYEE, IT, ADMIN |
| GET | /api/test/it | IT, ADMIN |
| GET | /api/test/admin | ADMIN |
| GET | /api/users | ADMIN |
| POST | /api/users | ADMIN |
| PATCH | /api/users/:id/status | ADMIN |
| PATCH | /api/users/:id/role | ADMIN |

Login nhận JSON `email`, `password`, trả `success`, `message`, `token`, `user`.

Tạo user nhận `name`, `email`, `password`, `role`, `status`; role/status mặc định EMPLOYEE/ACTIVE nếu bỏ qua. Đổi role nhận `{"role":"IT"}`; đổi status nhận `{"status":"INACTIVE"}`. ID phải là số nguyên dương. API chỉ trả các trường user an toàn, không trả hash.

HTTP: 400 dữ liệu không hợp lệ; 401 đăng nhập/token không hợp lệ hoặc user bị vô hiệu hóa; 403 không đủ quyền; 404 không có user/API; 409 email trùng; 503 thiếu bảng/lỗi kết nối database. Các lỗi bất ngờ trả 500 với thông báo chung, không trả thông tin nhạy cảm.

## Kiểm thử

Đã kiểm thử Giai đoạn 2: 15/15 ca API PASS trên MySQL thật; đăng nhập, tải lại trang và đăng xuất của cả ba role PASS trên Microsoft Edge; frontend build thành công. Ba tài khoản demo hiện đều ACTIVE. Xem `docs/giai-doan-2.md` để biết kết quả chi tiết và cách chạy lại các script trong `backend/tests/`. Các file `docs/stage2-api-results.json` và `docs/stage2-browser-results.json` lưu kết quả thực tế, không chứa mật khẩu hoặc token.

Dừng sau Giai đoạn 3; chỉ chuyển sang Giai đoạn 4 khi được xác nhận.

## Giai đoạn 3 — Ticket Management

Chạy `database/03_create_tickets.sql` trong MySQL Workbench để tạo `tickets` và `ticket_history` nếu thiết lập mới. Trên máy hiện tại người dùng đã chạy thành công; không cần tạo lại users.

- EMPLOYEE: tạo và xem Ticket của chính mình.
- IT: xem tất cả, tiếp nhận và xử lý Ticket đã nhận; priority điều chỉnh thủ công.
- ADMIN: xem và xử lý tất cả Ticket, giữ các API quản lý users cũ.
- Workflow: NEW → RECEIVED → IN_PROGRESS → RESOLVED → CLOSED; cho phép RESOLVED → IN_PROGRESS.
- Bắt buộc giải pháp khi RESOLVED. CLOSED chỉ xem.
- Ghi history lúc tạo và mọi chuyển trạng thái; transaction và khóa dòng bảo vệ tính nhất quán.

| Method | API | Nội dung |
|---|---|---|
| POST | /api/tickets | Employee tạo yêu cầu |
| GET | /api/tickets | Danh sách theo quyền |
| GET | /api/tickets/:id | Chi tiết và lịch sử |
| PATCH | /api/tickets/:id/accept | IT/Admin tiếp nhận |
| PATCH | /api/tickets/:id/priority | Đổi LOW/MEDIUM/HIGH |
| PATCH | /api/tickets/:id/status | Chuyển trạng thái; kèm solution khi RESOLVED |

Đã kiểm chứng 25/25 ca backend, năm ca bổ sung về bảo mật/workflow/transaction, toàn bộ luồng Ticket trên Edge và hồi quy Giai đoạn 1/2. Không thêm dependency ứng dụng.

Xem [tài liệu Giai đoạn 3](docs/giai-doan-3.md) để biết request mẫu, quyền, cách chạy test và kết quả chi tiết. Báo cáo thực tế ở `docs/stage3-api-results.json`, `docs/stage3-browser-results.json`; ảnh demo ở `docs/stage3-ticket-demo.png`.

Dữ liệu sau kiểm thử: 3 user demo ACTIVE, 3 Ticket (2 CLOSED, 1 IN_PROGRESS), 17 history. Danh sách chưa phân trang và cần bấm Làm mới để xem thay đổi từ người dùng khác.
