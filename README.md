# Hệ thống hỗ trợ CNTT nội bộ

Hệ thống hỗ trợ xử lý sự cố CNTT nội bộ: quản lý Ticket và tra cứu hướng dẫn trong Kho kiến thức (Knowledge Base).

Đã hoàn thành Giai đoạn 1–4: Authentication/RBAC, Ticket Management và Knowledge Base truyền thống. Tìm kiếm hiện tại là tìm kiếm từ khóa phía frontend; chưa triển khai RAG hoặc AI Assistant.

## Công nghệ

- Frontend: React, Vite, CSS; quản lý giao diện bằng React state.
- Backend: Node.js, Express 5, mysql2, dotenv, cors.
- Database: MySQL, quản lý bằng MySQL Workbench.
- Authentication: JWT (HS256), bcrypt (cost 12).
- Môi trường ban đầu: Node.js 22.17.1, npm 10.9.2. Không cần XAMPP hoặc Docker.

## Cấu trúc

```text
frontend/src/           Đăng nhập, Ticket, Knowledge Base, API helper
backend/src/config/     Cấu hình môi trường, MySQL, JWT
backend/src/controllers/ Auth, users, Ticket, Knowledge Base, health
backend/src/models/     Truy vấn MySQL sử dụng tham số
backend/src/middleware/  JWT, RBAC, xử lý lỗi
backend/src/routes/      Định tuyến API
backend/src/utils/       Validation, seed users và Knowledge Base
backend/tests/           Kiểm thử API, browser và hồi quy
backend/server.js        Khởi động server
database/               SQL chạy thủ công trong MySQL Workbench
docs/                   Tài liệu, báo cáo và ảnh kiểm thử
```

## Vai trò

| Role | Ticket | Knowledge Base | Users |
| --- | --- | --- | --- |
| EMPLOYEE | Tạo và xem Ticket của mình | Chỉ đọc bài PUBLISHED | Xem thông tin phiên của mình |
| IT | Xem tất cả, tiếp nhận và xử lý Ticket được giao cho mình | Xem tất cả, tạo, sửa, đổi trạng thái | Không quản trị |
| ADMIN | Xem và xử lý tất cả Ticket | Quyền giống IT | Quản lý qua API |

Hiện chưa có giao diện quản trị users riêng. Backend kiểm tra quyền từ database trên mỗi yêu cầu, không chỉ dựa vào nút hiển thị trên frontend.

## Chức năng đã hoàn thành

### Authentication

- Đăng nhập, JWT, RBAC; chặn tài khoản INACTIVE.
- Mật khẩu lưu bằng bcrypt, không lưu plaintext trong database.
- Frontend giữ token trong sessionStorage theo tab, gọi /api/auth/me khi reload; kiểm tra lại khi quay lại tab và định kỳ một phút.
- Đăng xuất xóa token ở trình duyệt; chưa có cơ chế thu hồi token phía server.

### Ticket Management

- Employee tạo yêu cầu; IT/Admin tiếp nhận, priority thủ công LOW/MEDIUM/HIGH.
- Workflow: NEW → RECEIVED → IN_PROGRESS → RESOLVED → CLOSED; cho phép RESOLVED → IN_PROGRESS.
- Bắt buộc solution khi RESOLVED; CLOSED chỉ xem.
- IT khác không được xử lý Ticket đã giao cho người khác. ADMIN có quyền xử lý tất cả.
- Lưu history khi tạo và mọi chuyển trạng thái; transaction và khóa dòng bảo vệ cập nhật Ticket/history.

### Knowledge Base

- Danh sách, chi tiết, tạo/sửa bài, trạng thái và phân quyền.
- Employee chỉ đọc PUBLISHED; IT/Admin quản lý mọi trạng thái.
- Tìm theo code/title, trim khoảng trắng, không phân biệt hoa/thường. Từ khóa rỗng trả toàn bộ danh sách API cho phép xem.
- Tám bài demo tiếng Việt về Wi-Fi, máy in, mật khẩu, email, máy chậm, thư mục mạng, microphone và website nội bộ.
- Loading, thông báo lỗi, danh sách rỗng, giữ xuống dòng nội dung; hỗ trợ bố cục màn hình nhỏ.

## Knowledge Base workflow

```text
DRAFT → PUBLISHED → ARCHIVED → DRAFT
```

Bài mới luôn DRAFT. Backend tự sinh code dạng KB-000001 từ ID thực tế; không yêu cầu mã bắt đầu từ 1 và có thể nhảy số. PUT chỉ sửa title/content; PATCH status chỉ cho phép chuyển theo workflow trên. Không có API xóa bài.

Keyword Search khác Semantic Search và RAG. Search hiện tại chỉ lọc chuỗi code/title trên danh sách frontend đã lấy từ API; không tìm theo ý nghĩa, không truy xuất vector và không sinh câu trả lời.

## Thiết lập database bằng MySQL Workbench

Với môi trường mới, kết nối MySQL local và chạy các file theo thứ tự:

1. database/01_create_database.sql
2. database/02_create_users.sql
3. database/03_create_tickets.sql
4. database/04_create_knowledge_base.sql

Database it_support_rag có bốn bảng: users, tickets, ticket_history, knowledge_articles. Các file dùng CREATE IF NOT EXISTS, không xóa dữ liệu. Bảng đã tồn tại sẽ không được tự điều chỉnh cấu trúc; cần kiểm tra nếu schema cũ khác. Môi trường hiện tại đã có đủ bốn bảng, không cần chạy lại SQL.

## Cấu hình local

Giữ cấu hình MySQL đang hoạt động trong backend/.env. Khi thiết lập mới, sao chép backend/.env.example thành backend/.env rồi điền cấu hình MySQL, JWT_SECRET ngẫu nhiên dài ít nhất 32 ký tự và SEED_USER_PASSWORD. Không đưa file .env hoặc secret thật vào Git.

SEED_USER_PASSWORD chỉ dùng tạo tài khoản local/demo lần đầu, ít nhất 8 ký tự và tối đa 72 byte UTF-8. Seed bỏ qua tài khoản có sẵn, không đổi mật khẩu hoặc quyền. Khởi động lại backend sau khi sửa cấu hình môi trường. Frontend mặc định gọi http://127.0.0.1:5000/api; có thể cấu hình VITE_API_URL theo API helper hiện tại.

## Cài đặt và chạy

Terminal thứ nhất, từ thư mục gốc; chỉ seed sau khi đã tạo bảng và cấu hình .env:

```powershell
cd backend
npm.cmd install
npm.cmd run seed:users
npm.cmd run seed:knowledge
npm.cmd run dev
```

Có thể dùng npm.cmd start để chạy backend không có nodemon.

Terminal thứ hai, từ thư mục gốc:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Trên PowerShell, npm.cmd tương đương npm và tránh lỗi ExecutionPolicy của npm.ps1. Các lệnh tương ứng là npm install, npm run dev, npm run seed:knowledge và npm run build.

- Frontend: http://127.0.0.1:5173
- Backend: http://127.0.0.1:5000
- Health: http://127.0.0.1:5000/api/health
- MySQL health: http://127.0.0.1:5000/api/health/db

Trong frontend, dùng npm.cmd run build để build và npm.cmd run preview để xem bản build. Dùng Ctrl+C dừng server. Origin frontend mặc định được backend cho phép là http://127.0.0.1:5173.

## Tài khoản demo

| Email | Role |
| --- | --- |
| employee@test.local | EMPLOYEE |
| it@test.local | IT |
| admin@test.local | ADMIN |

Chỉ dùng local/demo. Mật khẩu là SEED_USER_PASSWORD tại thời điểm tạo tài khoản; không công bố mật khẩu thật trong tài liệu. Ba tài khoản demo hiện ACTIVE.

Sau đăng nhập, chọn Ticket hoặc Kho kiến thức. Reload giữ phiên và trở về tab Ticket. Frontend không lưu mật khẩu vào sessionStorage/localStorage.

## Seed Knowledge Base

Chạy npm.cmd run seed:knowledge trong backend. Script yêu cầu MySQL local, bảng knowledge_articles và tài khoản it@test.local có role IT, status ACTIVE; từ chối production.

Mỗi bài mới được tạo rồi xuất bản bằng model hiện có. Seed nhận diện bài qua tiêu đề gốc hoặc marker [DEMO-KB:...] trong nội dung. Bài đã tồn tại được bỏ qua hoàn toàn: không đổi code, nội dung, trạng thái hoặc timestamp. Chạy lại trên bộ demo hiện tại tạo 0, bỏ qua 8.

Nếu mất cả tiêu đề gốc và marker hoặc nhận diện bị trùng, script dừng để kiểm tra thủ công. Seed không tự xuất bản lại bài đã tồn tại ở DRAFT/ARCHIVED. Không xóa dữ liệu để seed lại. Nội dung seed là dữ liệu đồ án, không phải quy trình chính thức của doanh nghiệp.

## API

Các API nghiệp vụ yêu cầu `Authorization: Bearer <token>`.

| Method | API | Quyền / chức năng |
| --- | --- | --- |
| GET | /api/health, /api/health/db | Công khai |
| POST | /api/auth/login | Công khai, nhận email/password |
| GET | /api/auth/me | User ACTIVE có JWT hợp lệ |
| GET | /api/test/employee | EMPLOYEE, IT, ADMIN |
| GET | /api/test/it | IT, ADMIN |
| GET | /api/test/admin | ADMIN |
| GET, POST | /api/users | ADMIN: danh sách/tạo user |
| PATCH | /api/users/:id/status, /api/users/:id/role | ADMIN |
| POST | /api/tickets | EMPLOYEE tạo Ticket |
| GET | /api/tickets, /api/tickets/:id | Danh sách/chi tiết và history theo quyền |
| PATCH | /api/tickets/:id/accept | IT/ADMIN tiếp nhận |
| PATCH | /api/tickets/:id/priority | IT/ADMIN, kiểm tra người được giao |
| PATCH | /api/tickets/:id/status | IT/ADMIN, kiểm tra workflow và người được giao |
| GET | /api/knowledge, /api/knowledge/:id | Employee chỉ PUBLISHED; IT/Admin mọi trạng thái |
| POST | /api/knowledge | IT/ADMIN; title, content |
| PUT | /api/knowledge/:id | IT/ADMIN; title, content |
| PATCH | /api/knowledge/:id/status | IT/ADMIN; status |

Response dùng success, message khi phù hợp và dữ liệu; KB trả articles cho danh sách hoặc article cho một bài. Không trả password/hash. HTTP 400: validation/workflow; 401: phiên không hợp lệ; 403: sai quyền; 404: không tồn tại; 409: trùng mã/email; 413: vượt giới hạn JSON 16 KB; 500/503: lỗi xử lý/database, thông báo an toàn.

## Kiểm thử và tài liệu

Trong backend, chạy bộ tổng hợp GĐ4.5:

```powershell
node tests/stage4-5-regression.cjs
```

Script tái sử dụng bộ API/browser hiện có, chạy build frontend và seed hai lần, giữ báo cáo các giai đoạn cũ. Kết quả mới lưu tại docs/stage4-5-results.json. Cần MySQL local, ba tài khoản demo khớp cấu hình, Microsoft Edge, Playwright đã có tại thư mục tạm it-support-browser-check/node_modules/playwright và cổng 5173 trống. Playwright không được thêm vào dependency ứng dụng.

Bộ tổng hợp dành cho bộ dữ liệu demo 3 users / 3 tickets / 17 history / 8 bài KB; dừng nếu dữ liệu ban đầu khác. Không chạy đồng thời với người khác sửa dữ liệu. Test tạo và dọn đúng bản ghi tạm, đối chiếu toàn bộ dữ liệu gốc trước/sau; không reset AUTO_INCREMENT. Kiểm thử seed giữ nội dung đã sửa dùng mô phỏng, không biên tập tám bài thật.

Kết quả GĐ4.5: Auth API 23/23, Ticket API 30/30, KB API 30/30, browser đăng nhập 7/7, browser Ticket 5/5, browser KB 39/39 PASS; health, DB health, build và hai lần seed PASS. Dữ liệu cuối: 3 users, 3 tickets, 17 history, 8 bài KB PUBLISHED.

- [GĐ2: Auth và RBAC](docs/giai-doan-2.md)
- [GĐ3: Ticket](docs/giai-doan-3.md)
- [GĐ4.2: KB API](docs/giai-doan-4-2.md)
- [GĐ4.3: Seed](docs/giai-doan-4-3.md)
- [GĐ4.4: Frontend KB](docs/giai-doan-4-4.md)
- [GĐ4.5: Tổng kết và kiểm thử](docs/giai-doan-4-5.md)

Tài liệu từng giai đoạn mô tả trạng thái tại thời điểm đó; README và tổng kết GĐ4.5 mô tả trạng thái hiện tại.

## Trạng thái dự án và giới hạn

Đã hoàn thành Authentication/RBAC, Ticket Management và Knowledge Base. Giai đoạn 4 đã hoàn thành.

Chưa triển khai RAG, Chunking, Embedding, Vector Search, Qdrant hoặc LLM Assistant. Không có chatbot hoặc tìm kiếm ngữ nghĩa.

Hiện chưa phân trang, cập nhật thời gian thực, upload hoặc lịch sử phiên bản KB. Search không bỏ dấu tiếng Việt; chuyển tab không lưu form chưa gửi. Review bảo mật ở phạm vi đồ án/local, chưa phải đánh giá bảo mật triển khai production.

Dừng trước Giai đoạn 5, chờ người dùng xác nhận phạm vi tiếp theo.
