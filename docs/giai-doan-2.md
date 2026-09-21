# Kết quả kiểm thử Giai đoạn 2

Hoàn tất kiểm thử trên MySQL thật và Microsoft Edge (headless). Thời gian từng lần chạy được ghi trong stage2-api-results.json và stage2-browser-results.json.

## Database và seed

- Database it_support_rag chỉ có bảng users, đúng cấu trúc trong database/02_create_users.sql: INT tự tăng; name VARCHAR(100); email VARCHAR(254) UNIQUE; password VARCHAR(255); ENUM role và status; timestamps tự quản lý.
- Đã chạy npm.cmd run seed:users tạo ba tài khoản EMPLOYEE, IT, ADMIN.
- Cả ba mật khẩu trong MySQL đều là bcrypt hash cost 12, đã xác minh bằng bcrypt.compare; không có mật khẩu plaintext trong bảng.
- Chạy lại seed không tạo trùng, không thay hash, vai trò hoặc trạng thái có sẵn.
- Sau kiểm thử chỉ còn ba tài khoản demo, đúng vai trò và đều ACTIVE. Tài khoản tạm tạo qua POST /api/users đã được xóa theo đúng ID và email của lần kiểm thử; không xóa dữ liệu có sẵn.

## Kết quả Test 1–15

| Test | Nội dung | HTTP | Kết quả |
|---|---|---|---|
| 1 | EMPLOYEE đăng nhập đúng | 200 | PASS |
| 2 | IT đăng nhập đúng | 200 | PASS |
| 3 | ADMIN đăng nhập đúng | 200 | PASS |
| 4 | Sai mật khẩu | 401 | PASS |
| 5 | Email không tồn tại | 401 | PASS |
| 6 | /api/auth/me không có token | 401 | PASS |
| 7 | /api/auth/me token hợp lệ, cả ba role | 200 | PASS |
| 8 | EMPLOYEE gọi endpoint IT | 403 | PASS |
| 9 | EMPLOYEE gọi endpoint ADMIN | 403 | PASS |
| 10 | IT gọi endpoint IT | 200 | PASS |
| 11 | IT gọi endpoint ADMIN | 403 | PASS |
| 12 | ADMIN gọi endpoint ADMIN | 200 | PASS |
| 13 | ADMIN xem danh sách users | 200 | PASS |
| 14 | EMPLOYEE xem danh sách users | 403 | PASS |
| 15 | User INACTIVE bị từ chối đăng nhập | 401 | PASS |

Test 15 còn xác minh token đã cấp bị từ chối khi user INACTIVE; sau đó khôi phục ACTIVE và đăng nhập lại thành công.

## Các kiểm tra API bổ sung

Tất cả PASS:

- Ma trận RBAC đầy đủ; EMPLOYEE và IT không thể tạo user, đổi role/status; IT không xem được danh sách users.
- ADMIN tạo user (201), mặc định EMPLOYEE/ACTIVE, mật khẩu mới được hash bcrypt.
- Email trùng kể cả khác chữ hoa/chữ thường bị từ chối (409).
- ADMIN đổi role; cùng token cũ nhận quyền mới và mất quyền khi đổi lại.
- Role, status, ID, email, tên và mật khẩu không hợp lệ bị từ chối (400).
- Token sai/hết hạn/sai chữ ký bị từ chối (401).
- Tất cả response đã kiểm tra không chứa trường password/hash/secret.
- /api/health và /api/health/db trả 200; backend vẫn hoạt động sau các yêu cầu bị từ chối.

## Frontend thực tế trên Edge

| Kiểm tra | Kết quả |
|---|---|
| EMPLOYEE: login, vai trò, tải lại trang, logout | PASS |
| IT: login, vai trò, tải lại trang, logout | PASS |
| ADMIN: login, vai trò, tải lại trang, logout | PASS |
| Sai mật khẩu: hiển thị lỗi và không lưu phiên | PASS |
| Token sai: xóa token, quay lại Login | PASS |
| Token hết hạn: xóa token, quay lại Login | PASS |
| Không có lỗi JavaScript runtime | PASS |
| npm.cmd run build | PASS |

Trình duyệt gửi yêu cầu tới backend thật và MySQL thật, không giả lập login. Công cụ Playwright được cài trong thư mục tạm của Windows, không thêm dependency vào frontend/backend. Các tiến trình kiểm thử đã được dừng.

## Chạy lại kiểm thử

Chỉ dùng MySQL local/demo, sau khi SQL và seed đã hoàn tất. Trong backend:

```powershell
node tests/stage2-api.cjs
```

Script API tạm đổi trạng thái EMPLOYEE, khôi phục trong finally; tạo một user tạm để kiểm tra API quản trị rồi chỉ xóa bản ghi do chính lần chạy đó tạo. Không chạy đồng thời với việc chỉnh sửa tài khoản demo.

Để chạy lại kiểm thử trình duyệt, cần Microsoft Edge, cổng frontend 5173 trống và Playwright trong thư mục tạm:

```powershell
npm.cmd install --prefix "$env:TEMP\it-support-browser-check" --no-save --package-lock=false playwright
node tests/stage2-browser.cjs
```

Script trình duyệt tự khởi động frontend và backend kiểm thử, rồi dừng chúng khi kết thúc. Backend kiểm thử dùng cổng trống tự cấp, frontend chỉ nhận địa chỉ API đó trong tiến trình kiểm thử; không sửa cấu hình local.

## Trạng thái hoàn tất

- 15/15 ca yêu cầu PASS; các kiểm tra bổ sung API và trình duyệt đều PASS.
- Chưa phát hiện lỗi trong phạm vi đã kiểm thử.
- Tài khoản demo: employee@test.local, it@test.local, admin@test.local. Mật khẩu demo được cung cấp riêng cho người dùng, không ghi vào báo cáo hoặc README.
- Không triển khai chức năng Giai đoạn 3. Dừng và chờ xác nhận.
