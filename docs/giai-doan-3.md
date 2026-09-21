# Giai đoạn 3 — Quản lý yêu cầu hỗ trợ

## Ticket là gì?

Ticket là một yêu cầu hỗ trợ CNTT do nhân viên tạo, gồm mã, tiêu đề, mô tả sự cố, độ ưu tiên, trạng thái, người tạo, người tiếp nhận và giải pháp. Nhân viên dùng Ticket để theo dõi tiến độ; IT dùng để ghi nhận quá trình xử lý.

## Database

Người dùng đã chạy database/03_create_tickets.sql trong MySQL Workbench. Hai bảng được kiểm tra đúng cấu trúc trước khi triển khai. Không sửa bảng users.

- tickets: lưu thông tin hiện tại của yêu cầu; code UNIQUE, priority mặc định LOW, status mặc định NEW.
- ticket_history: lưu actor, trạng thái cũ/mới, ghi chú và thời điểm. Lúc tạo có old_status NULL và new_status NEW.
- Foreign key dùng ON DELETE RESTRICT để không xóa nhầm Ticket/lịch sử khi xóa user.
- Mã TKT-000001 được tạo từ ID tự tăng. Backend insert mã tạm ngẫu nhiên, lấy insertId rồi đổi sang mã chính trong cùng transaction. Không lấy MAX(id), nên các lần tạo đồng thời không dùng chung ID. Mã có thể nhảy số sau rollback/dọn dữ liệu test; đây là hành vi bình thường.

## Workflow

```text
NEW → RECEIVED → IN_PROGRESS → RESOLVED → CLOSED
                     ↑           │
                     └───────────┘
```

- NEW: mới tạo, chưa có người nhận.
- RECEIVED: IT/ADMIN tiếp nhận; assigned_to luôn lấy từ user đang đăng nhập.
- IN_PROGRESS: đang xử lý.
- RESOLVED: đã có giải pháp; bắt buộc gửi solution không rỗng.
- CLOSED: đã đóng, chỉ xem, không đổi trạng thái hoặc priority.
- RESOLVED → IN_PROGRESS: cần xử lý lại; giữ giải pháp trước để tham khảo, nhưng lần RESOLVED tiếp theo vẫn phải gửi giải pháp.

NEW → RECEIVED chỉ thực hiện qua endpoint accept. Các chuyển trạng thái còn lại dùng endpoint status. Không nhảy bước, không có REOPENED.

## Priority

Chỉ có LOW (Thấp), MEDIUM (Trung bình), HIGH (Cao). Nhân viên không chọn priority khi tạo; mặc định LOW. IT/ADMIN điều chỉnh thủ công. Không có AI hoặc lịch sử priority riêng.

## Quyền

| Hành động | EMPLOYEE | IT | ADMIN |
|---|---|---|---|
| Tạo Ticket | Có | Không | Không |
| Danh sách/chi tiết/history | Chỉ Ticket tự tạo | Tất cả | Tất cả |
| Tiếp nhận Ticket NEW | Không | Có | Có |
| Đổi priority trước khi đóng | Không | Chưa có người nhận hoặc mình đã nhận | Tất cả |
| Xử lý, giải quyết, mở lại, đóng | Không | Chỉ Ticket mình nhận | Tất cả |
| Thay đổi Ticket CLOSED | Không | Không | Không |

Quyền được kiểm tra ở backend bằng JWT, role từ database và created_by/assigned_to. Ẩn nút frontend chỉ để giao diện phù hợp, không thay thế phân quyền backend. API user dành cho ADMIN của Giai đoạn 2 được giữ nguyên; không bổ sung màn hình quản trị user mới trong giai đoạn này.

## API

Tất cả endpoint Ticket yêu cầu Authorization: Bearer token.

| Method | Endpoint | Ý nghĩa |
|---|---|---|
| POST | /api/tickets | EMPLOYEE tạo yêu cầu |
| GET | /api/tickets | Danh sách mới nhất trước, lọc theo quyền |
| GET | /api/tickets/:id | Chi tiết và history cũ đến mới |
| PATCH | /api/tickets/:id/accept | Tiếp nhận Ticket NEW |
| PATCH | /api/tickets/:id/priority | Thay priority thủ công |
| PATCH | /api/tickets/:id/status | Chuyển trạng thái theo workflow |

Tạo Ticket:

```json
{"title":"Không kết nối được Wi-Fi","description":"Máy tính không kết nối mạng văn phòng."}
```

Client chỉ được gửi title và description. Các trường created_by, assigned_to, priority, status, solution bị từ chối nếu gửi kèm. Title tối đa 255 ký tự; description tối đa 4000 ký tự.

Tiếp nhận: không gửi body hoặc gửi `{}`; không nhận assigned_to từ client.

Đổi priority:

```json
{"priority":"HIGH"}
```

Bắt đầu xử lý hoặc xử lý lại:

```json
{"status":"IN_PROGRESS"}
```

Giải quyết:

```json
{"status":"RESOLVED","solution":"Đã cấu hình lại driver Wi-Fi và kết nối lại mạng."}
```

Đóng:

```json
{"status":"CLOSED"}
```

Response dùng success và ticket hoặc tickets; chi tiết có history. Các thông tin người dùng chỉ gồm ID/tên, không trả password/hash. Solution tối đa 4000 ký tự. Giới hạn JSON toàn ứng dụng hiện là 16 KB; payload vượt giới hạn trả 413.

HTTP: 201 tạo thành công; 200 xem/cập nhật; 400 dữ liệu sai; 401 chưa đăng nhập; 403 không có quyền; 404 không có Ticket; 409 workflow xung đột; 500 lỗi bất ngờ, thông báo không lộ thông tin nhạy cảm.

## Transaction và lịch sử

Tạo Ticket, sinh code và ghi history nằm trong cùng transaction. Tiếp nhận/chuyển trạng thái cũng cập nhật tickets và insert history trong một transaction. Nếu một bước thất bại, rollback toàn bộ.

SELECT ... FOR UPDATE khóa dòng Ticket trong lúc thay đổi: nếu hai IT cùng tiếp nhận, người thứ hai phải đợi rồi đọc trạng thái mới, nên bị từ chối. Đọc chi tiết/history dùng cùng transaction để có snapshot nhất quán.

## File triển khai

Mới:

- backend/src/models/ticketModel.js
- backend/src/controllers/ticketController.js
- backend/src/routes/ticketRoutes.js
- frontend/src/Tickets.jsx
- backend/tests/stage3-api.cjs
- backend/tests/stage3-browser.cjs
- docs/giai-doan-3.md
- docs/stage3-api-results.json
- docs/stage3-browser-results.json
- docs/stage3-ticket-demo.png

Sửa:

- backend/src/app.js: gắn route Ticket.
- backend/src/middleware/errorMiddleware.js: xử lý lỗi nghiệp vụ Ticket, thông báo thiếu bảng phù hợp.
- frontend/src/App.jsx: thêm Tickets sau đăng nhập.
- frontend/src/style.css: form, bảng, chi tiết Ticket.
- README.md: cập nhật Giai đoạn 3.
- docs/stage2-api-results.json và docs/stage2-browser-results.json: kết quả hồi quy mới.

File database/03_create_tickets.sql đã được tạo ở bước trước và người dùng đã chạy; không thay đổi schema trong bước triển khai này. Không thêm dependency ứng dụng.

## Kết quả kiểm thử backend

Thực hiện qua HTTP với MySQL thật. Các tài khoản Employee/IT bổ sung dùng để kiểm tra quyền chéo đã được dọn sau kiểm thử. B4 chủ động làm bước ghi history ném lỗi trong tiến trình kiểm thử, rồi kiểm tra rollback trên dữ liệu MySQL thật; đây không phải sự cố MySQL tự phát.

| Test | Nội dung | Kết quả |
|---|---|---|
| 1 | EMPLOYEE tạo Ticket NEW | PASS |
| 2 | Priority mặc định LOW | PASS |
| 3 | EMPLOYEE chỉ thấy Ticket của mình | PASS |
| 4 | EMPLOYEE không xem Ticket người khác | PASS |
| 5 | EMPLOYEE không được tiếp nhận | PASS |
| 6 | IT xem tất cả Ticket | PASS |
| 7 | IT tiếp nhận NEW -> RECEIVED | PASS |
| 8 | assigned_to lấy từ IT đăng nhập | PASS |
| 9 | Priority LOW -> HIGH | PASS |
| 10 | RECEIVED -> IN_PROGRESS | PASS |
| 11 | Không cho NEW -> RESOLVED | PASS |
| 12 | RESOLVED thiếu solution bị từ chối | PASS |
| 13 | RESOLVED có solution thành công | PASS |
| 14 | RESOLVED -> CLOSED | PASS |
| 15 | CLOSED không mở lại | PASS |
| 16 | RESOLVED -> IN_PROGRESS | PASS |
| 17 | Mọi thay đổi trạng thái có history đúng thứ tự | PASS |
| 18 | EMPLOYEE xem history của mình | PASS |
| 19 | IT khác không xử lý Ticket đã assigned | PASS |
| 20 | API không trả password/hash user | PASS |
| 21 | Không token -> 401 | PASS |
| 22 | Role không phù hợp -> 403 | PASS |
| 23 | ID không tồn tại -> 404, ID sai -> 400 | PASS |
| 24 | Priority không hợp lệ bị từ chối | PASS |
| 25 | Title/description rỗng bị từ chối | PASS |
| B1 | Chặn giả mạo trường server quản lý | PASS |
| B2 | ADMIN xử lý Ticket của IT, CLOSED chỉ xem | PASS |
| B3 | Hai người nhận đồng thời: chỉ một thành công | PASS |
| B4 | Rollback thật khi bước ghi history thất bại | PASS |
| B5 | Workflow khác bị chặn và không thêm history | PASS |

## Kiểm thử frontend

Tất cả PASS trên Microsoft Edge headless, dùng tài khoản demo và API/MySQL thật:

- EMPLOYEE đăng nhập, tạo Ticket, xem danh sách, chi tiết và lịch sử ban đầu; tải lại trang vẫn xem được.
- IT mở Ticket của Employee, tiếp nhận, đổi HIGH, bắt đầu xử lý, nhập giải pháp, RESOLVED và CLOSED.
- EMPLOYEE đăng nhập lại thấy trạng thái Đã đóng, đúng IT, giải pháp và đủ năm mục history.
- ADMIN xem Ticket/history; API users vẫn hoạt động.
- Không có lỗi JavaScript runtime. Frontend build thành công.

Ảnh giao diện sau kiểm thử: stage3-ticket-demo.png. Script dùng Playwright đã cài ở thư mục tạm Windows, không thêm vào dependency dự án. Các tiến trình kiểm thử đã dừng.

## Hồi quy Giai đoạn 1 và 2

Đã chạy lại backend/tests/stage2-api.cjs và backend/tests/stage2-browser.cjs:

- /api/health, /api/health/db: PASS.
- Toàn bộ Test 1–15 Giai đoạn 2: PASS.
- Bcrypt, seed không trùng, RBAC, ADMIN tạo user/đổi role/status, validation, token sai/hết hạn: PASS.
- Login cả ba role, tải lại trang, logout, thông báo sai mật khẩu và xử lý token trên Edge: PASS.
- Tài khoản demo sau hồi quy đều ACTIVE, đúng role ban đầu.

## Dữ liệu demo còn lại sau lần kiểm thử này

users: 3 tài khoản employee@test.local (EMPLOYEE), it@test.local (IT), admin@test.local (ADMIN), đều ACTIVE.

| Ticket | Trạng thái | Priority | Số history |
|---|---|---|---|
| TKT-000001 — Wi-Fi | CLOSED | HIGH | 5 |
| TKT-000003 — Máy in | IN_PROGRESS | MEDIUM | 7 |
| TKT-000007 — Demo giao diện Wi-Fi | CLOSED | HIGH | 5 |

Cả ba do Employee demo tạo và IT demo tiếp nhận. Tổng cộng 3 Ticket, 17 history. Không còn user/ticket phụ dùng kiểm tra quyền chéo hoặc cạnh tranh. Dữ liệu này phản ánh lần chạy đã báo cáo; chạy lại test sẽ tạo thêm Ticket demo.

## Cách chạy và kiểm tra lại

Chạy ứng dụng bằng npm.cmd run dev trong backend và frontend (hai terminal riêng), mở http://127.0.0.1:5173. Đăng nhập tài khoản demo theo vai trò. Dùng Làm mới danh sách/chi tiết để lấy cập nhật của người dùng khác.

Trong thư mục backend, chỉ dùng với dữ liệu local/demo:

```powershell
node tests/stage3-api.cjs
node tests/stage3-browser.cjs
node tests/stage2-api.cjs
node tests/stage2-browser.cjs
```

Script trình duyệt cần Edge, cổng 5173 trống và Playwright ở thư mục tạm như hướng dẫn Giai đoạn 2. Không chạy test đồng thời với việc sửa tài khoản demo. Script API tạo rồi dọn dữ liệu tạm theo ID; giữ lại hai Ticket demo nếu toàn bộ ca đạt. Script browser giữ lại một Ticket để xem giao diện.

## Giới hạn hiện tại

Danh sách chưa phân trang/tìm kiếm; không cập nhật thời gian thực. Không sửa/xóa Ticket qua API. Giải pháp lưu bản gần nhất trên tickets, lịch sử chỉ ghi chuyển trạng thái, không lưu từng phiên bản giải pháp. Priority không có history riêng. Đăng xuất và lưu phiên giữ nguyên cách làm Giai đoạn 2.

Chưa phát hiện lỗi trong phạm vi các ca đã chạy. Không triển khai Knowledge Base, RAG, Qdrant, AI, SLA hoặc chức năng ngoài phạm vi. Dừng ở Giai đoạn 3, chờ xác nhận.
