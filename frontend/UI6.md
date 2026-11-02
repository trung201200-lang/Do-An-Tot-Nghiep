# UI 6 — Quản lý người dùng (ADMIN)

## Contract và nghiệp vụ đã kiểm chứng từ code

Đã đọc `backend/src/routes/userRoutes.js`, `controllers/userController.js`, `models/userModel.js`, `utils/validation.js`, `middleware/authMiddleware.js` và `middleware/errorMiddleware.js` trước khi sửa frontend. Đây là kiểm chứng mã nguồn; không truy vấn tài khoản/database thật.

Tất cả endpoint `/api/users` yêu cầu xác thực và vai trò ADMIN:

| Thao tác | Endpoint | Payload gửi | Response thành công |
| --- | --- | --- | --- |
| Danh sách | GET `/api/users` | Không body | `{success:true, users:[...]}` |
| Tạo tài khoản | POST `/api/users` | `{name,email,password,role,status}` | HTTP 201, `{success:true,message,user}` |
| Đổi vai trò | PATCH `/api/users/:id/role` | `{role}` | `{success:true,message,user}` |
| Đổi trạng thái | PATCH `/api/users/:id/status` | `{status}` | `{success:true,message,user}` |

Vai trò: EMPLOYEE / IT / ADMIN. Trạng thái: ACTIVE / INACTIVE. Controller mặc định EMPLOYEE/ACTIVE nếu tạo thiếu hai trường này; frontend hiển thị mặc định tương ứng và gửi đủ năm trường. Không gửi trường khác. Không thêm GET chi tiết người dùng, DELETE, reset mật khẩu hoặc phân quyền chi tiết vì chưa có API.

GET list trả `id,name,email,role,status,created_at,updated_at`; response create/PATCH trả `id,name,email,role,status` và có thể thiếu ngày. Frontend chỉ giữ các trường được phép, lấy chi tiết quản lý từ list rồi tải lại list sau khi ghi. Không tạo ngày giả nếu response thiếu ngày.

Validation khớp backend:

- Name trim, không rỗng, tối đa 100 đơn vị UTF-16 (`String.length`).
- Email trim/lowercase, tối đa 254 đơn vị UTF-16, kiểm tra regex giống `isEmail` trong backend. Trường email của trình duyệt cũng có thể bỏ khoảng trắng ngoài cùng.
- Password không trim; ít nhất 8 đơn vị UTF-16 và tối đa 72 byte UTF-8 (giới hạn bcrypt). Không thêm chính sách ký tự đặc biệt/hoa/thường khác backend.
- Role/status phải thuộc enum trên. Xung đột email trả 409; lỗi validation 400; tài khoản không còn tồn tại 404.

## Tự đổi quyền, tự vô hiệu hóa và ADMIN cuối cùng

`userModel.updateAccess()` khóa danh sách tài khoản trong transaction và chặn việc chuyển một ADMIN ACTIVE thành vai trò khác hoặc INACTIVE nếu không còn ADMIN ACTIVE khác. ADMIN INACTIVE không được tính là ADMIN đang hoạt động.

Backend **không có luật cấm riêng thao tác trên chính tài khoản**. Khi còn ADMIN ACTIVE khác, tự hạ quyền hoặc tự vô hiệu hóa vẫn được phép. Frontend không tự cấm các thao tác đó; hộp xác nhận giải thích tác động. Sau khi backend xác nhận:

- Tự đổi sang EMPLOYEE/IT: cập nhật vai trò phiên trong App, rời màn hình quản trị, ẩn menu ngay.
- Tự vô hiệu hóa: gọi logout hiện có, xóa session và trở về đăng nhập.
- Backend kiểm tra role/status từ database mỗi request, không chỉ dựa vào JWT. Backend vẫn là lớp bảo vệ cuối cùng.

Code nội bộ `LAST_ACTIVE_ADMIN` **không được đưa ra response** bởi `errorMiddleware`; giao diện xử lý HTTP 409, không phụ thuộc mã lỗi này. Cảnh báo ADMIN cuối cùng dựa trên list hiện tại chỉ mang tính thông tin; server kiểm tra lại dữ liệu tại lúc PATCH. Có test thay đổi dữ liệu mock giữa lúc mở xác nhận và gửi PATCH.

App bỏ qua phản hồi `/auth/me` cũ đến sau thao tác tự đổi quyền hoặc logout, tránh khôi phục vai trò cũ trên giao diện. Test mô phỏng phản hồi auth chậm sau tự hạ quyền.

## Giao diện và xử lý lỗi

- Chỉ ADMIN thấy sidebar và màn hình; App chặn điều hướng users khi không có quyền, component cũng kiểm tra trước khi mount phần gọi API.
- Danh sách thật với tìm tên/email/ID, lọc vai trò/trạng thái, badge chữ, đánh dấu tài khoản hiện tại. Loading/error/empty/no-results riêng; response sai cấu trúc không biến thành mảng rỗng.
- Form tạo có lỗi gần trường và focus trường lỗi. 409 email có lỗi ngay dưới email. Các lỗi server khác dùng thông báo an toàn chung, không echo request/body lỗi có thể chứa dữ liệu nhạy cảm.
- Password luôn là input che ký tự, không có nút hiển thị; xóa state/ô nhập ngay khi gửi form hợp lệ, cả khi API thất bại. Giữ name/email/role/status để sửa và nhập lại password nếu cần. Không log payload, không tự lưu form vào storage, không hiển thị mật khẩu trong thông báo, xác nhận hoặc list.
- Đổi role/status dùng hai thao tác riêng, nút disabled nếu không đổi. Luôn có xác nhận trước PATCH; Escape/Hủy không gửi request. Có vòng Tab/Shift+Tab, focus đầu ở Hủy và trả focus về nơi mở.
- Chặn gửi trùng bằng ref; request có timeout 15 giây và abort khi rời màn hình. Epoch bảo vệ kết quả load cũ trong lifecycle/StrictMode. Timeout hoặc mất mạng khi ghi có thể chưa biết kết quả server; thông báo yêu cầu tải lại để kiểm tra trước khi thử lại.
- POST thành công đóng form ngay; lỗi tải lại không để gửi tạo trùng. PATCH thành công nhưng refresh lỗi chặn thao tác tiếp đến khi tải list mới. 404 cũng yêu cầu làm mới trước khi thao tác tiếp.
- 401 logout. 403 ẩn dữ liệu và thao tác quản trị, kiểm tra lại `/auth/me`; nếu quyền đã đổi thì menu/màn hình được cập nhật. Nếu kiểm tra phiên không kết nối được, màn hình quản trị vẫn bị chặn; có thể thử tải lại list khi quyền/kết nối được khôi phục.

## File thay đổi trong UI 6

- `src/pages/UserManagement.jsx`: điều phối API/list/create/access, xác nhận, lỗi và lifecycle.
- `src/components/users/UserViews.jsx`, `userData.js`: giao diện, validation và lọc response an toàn.
- `src/styles/users.css`: đồng bộ tokens và responsive.
- `src/App.jsx`: tích hợp màn hình, guard, xử lý tự đổi quyền/trạng thái và phản hồi kiểm tra phiên cũ.
- `scripts/check-ui1.mjs`: nối UI 6 fixture, cập nhật regression từ placeholder users sang màn hình thật.
- `scripts/users-ui-checks.mjs`, `package.json`, tài liệu này.

Không sửa backend/database, Ticket, KB, RAG, provider hoặc API contract. Không cài thêm package.

## Kiểm thử và kiểm tra trực tiếp

Trong frontend:

```powershell
npm run build
npm run test:ui1
npm run test:ui2
npm run test:ui3
npm run test:ui4
npm run test:ui5
npm run test:ui6
```

Tại thư mục project: `git diff --check`.

Runner dùng Node và Edge/Chrome cài sẵn, chặn toàn bộ API của trang bằng CDP. UI 6 chỉ dùng tài khoản/dữ liệu giả lập trong bộ nhớ, không gọi database thật. Fixture kiểm tra credential tổng hợp rồi bỏ, không ghi password/raw body vào audit log. Không đọc `.env` hoặc credential thật. Ảnh/profile ở `frontend/node_modules/.cache/ui6-check`, được Git bỏ qua; không đưa vào commit.

Test UI 6 bao gồm ADMIN/EMPLOYEE/IT, search/filter, loading/empty/error, validation và 72 byte UTF-8, tạo thành công/lỗi, xóa trường mật khẩu, payload, chống gửi trùng, xác nhận/keyboard, đổi vai trò/trạng thái, ADMIN cuối cùng, dữ liệu thay đổi đồng thời, refresh lỗi sau ghi, 401/403/404/409, tự hạ quyền/tự vô hiệu hóa, auth response chậm, hạ quyền ngoài phiên và responsive 390/320px.

Kết quả bản UI 6: build thành công; UI 1: 22/22, UI 2: 17/17, UI 3: 23/23, UI 4: 17/17, UI 5: 17/17, UI 6: 20/20 (tổng 116/116 nhóm kiểm tra). `git diff --check` không báo lỗi. Regression UI 1 được cập nhật để chờ danh sách người dùng tải xong trước khi mô phỏng thu hồi quyền, vì màn hình này đã thay placeholder bằng API thật.

Để kiểm tra website:

1. Tải lại, đăng nhập ADMIN → **Quản lý người dùng**. Thử tìm/lọc, mở Quản lý, quay lại bằng bàn phím. EMPLOYEE/IT không có menu này.
2. Mở Tạo tài khoản, gửi trống để kiểm tra lỗi mà không ghi dữ liệu. Chỉ gửi form hợp lệ khi thực sự muốn tạo tài khoản thật; sau gửi mật khẩu phải được xóa khỏi form.
3. Chọn vai trò/trạng thái khác, mở xác nhận rồi Hủy/Escape để kiểm tra an toàn. Chỉ xác nhận khi muốn thay đổi tài khoản thật. Tự vô hiệu hóa sẽ đăng xuất.
4. Kiểm tra label ADMIN cuối cùng và thông báo xung đột. Có thể chạy các ca ràng buộc này bằng `test:ui6` thay vì tác động tài khoản thật.
5. Thử desktop, 390px/320px, Tab/Shift+Tab/Enter/Escape. Nếu frontend chưa chạy: `npm run dev` trong frontend.

## Giới hạn

- Đã đối chiếu quy tắc từ code và chạy mock; chưa tạo/sửa tài khoản trên database thật.
- Tìm/lọc phía trình duyệt; chưa có phân trang server, audit history, reset mật khẩu hoặc xóa tài khoản.
- Không có cơ chế lưu form khi reload/rời menu; password không được giữ để gửi lại. Xóa field không phải cam kết xóa toàn bộ bản sao trong bộ nhớ trình duyệt hay trình quản lý mật khẩu của người dùng.
- Chưa kiểm thử nhiều trình duyệt, tải lớn hoặc trình đọc màn hình đầy đủ. Request abort ở frontend không bảo đảm server đã hủy thao tác ghi.
