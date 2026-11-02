# UI 5 — Dashboard thống kê

## Contract đã đối chiếu trong mã backend

Đã đọc controller, model và route trước khi triển khai. Đây là kiểm chứng từ code trong workspace, không phải phép đo API/database thật. Không dùng tài khoản thật hoặc đọc `.env`.

| API | Response thành công | Quyền và nguồn kiểm chứng |
| --- | --- | --- |
| GET `/api/tickets` | `{success: true, tickets: [...]}` | `backend/src/controllers/ticketController.js:list`, `models/ticketModel.js:list`, `routes/ticketRoutes.js`. EMPLOYEE được lọc `created_by = user.id`; IT/ADMIN nhận danh sách được phép xem. Model sắp xếp `created_at DESC, id DESC`. |
| GET `/api/knowledge` | `{success: true, articles: [...]}` | `controllers/knowledgeArticleController.js:list`, `models/knowledgeArticleModel.js:list`, `routes/knowledgeArticleRoutes.js`. EMPLOYEE chỉ PUBLISHED; IT/ADMIN xem cả DRAFT/PUBLISHED/ARCHIVED. |
| GET `/api/users` | `{success: true, users: [...]}` | `controllers/userController.js:list`, `models/userModel.js:listUsers`, `routes/userRoutes.js`. Route chỉ cho ADMIN. List chọn `id,name,email,role,status,created_at,updated_at`; Dashboard chỉ dùng `id,role,status`. |

Các route được mount tại `/api` trong `backend/src/app.js`. Mã frontend tiếp tục dùng `apiRequest('/tickets' | '/knowledge' | '/users')`, không đổi base URL hay contract.

## Trường thực sự sử dụng

- Ticket: `id` để kiểm tra bản ghi/sắp xếp khi trùng ngày; `code`, `title`, `status` để hiển thị; `created_by` để kiểm tra phạm vi EMPLOYEE; `assigned_to` so với `user.id` để tính việc IT; `assignee_name` để hiển thị người phụ trách; `created_at` cho danh sách gần đây/thời gian tạo. Không dùng `description`, `solution`, `priority` hoặc `updated_at` để tính chỉ số.
- KB: `id`, `status`; tổng và số bài theo từng trạng thái. Không hiển thị nội dung bài trên Dashboard.
- Users: `id`, `role`, `status`; tổng, phân bố vai trò EMPLOYEE/IT/ADMIN, số ACTIVE/INACTIVE. Không hiển thị tên/email từng tài khoản.
- Phiên đăng nhập: `user.id`, `user.role`, `user.name` và token truyền cho `apiRequest` như luồng hiện có. Không ghi log hoặc thêm lưu trữ credential.

## Quy tắc thống kê

| Vai trò | Thẻ thống kê Ticket | Danh sách |
| --- | --- | --- |
| EMPLOYEE | Tổng Ticket của mình; IN_PROGRESS; RESOLVED | Tối đa 5 Ticket mới nhất có `created_at` hợp lệ |
| IT | NEW; toàn bộ Ticket `assigned_to === user.id` (kể cả CLOSED); IN_PROGRESS do mình phụ trách | NEW của toàn hệ thống được phép xem + Ticket do mình phụ trách ở RECEIVED/IN_PROGRESS/RESOLVED; tối đa 6 bản ghi |
| ADMIN | Tổng Ticket; NEW; IN_PROGRESS | Tối đa 5 Ticket mới nhất có `created_at` hợp lệ |

Biểu đồ thanh CSS hiển thị đủ 5 trạng thái NEW, RECEIVED, IN_PROGRESS, RESOLVED, CLOSED với nhãn chữ và số đếm. RESOLVED không gộp CLOSED; RECEIVED không gộp IN_PROGRESS. Thanh có độ dài `số trạng thái / tổng số Ticket`, không suy diễn SLA hoặc hiệu suất. Phần thanh trang trí `aria-hidden`, nhãn và số vẫn đọc được.

KB hiển thị tổng và trạng thái trong phạm vi quyền. Accounts chỉ gọi/hiển thị với ADMIN, chỉ có số khi response thành công và hợp lệ. Mỗi nguồn tải độc lập; lỗi, timeout, thiếu mảng, trạng thái không hợp lệ, trùng ID hoặc `success:false` không biến thành 0. Mảng rỗng thành công mới hiển thị số 0 và empty state.

Ngày tạo thiếu/sai được bỏ khỏi danh sách **gần đây** nhưng Ticket vẫn tính trong tổng; có thông báo số bản ghi thiếu ngày. Nếu không có ngày hợp lệ, không dựng danh sách “gần đây” giả. Việc cần xử lý của IT vẫn có thể hiển thị bản ghi thiếu ngày, không gán ngày thay thế; bản ghi có ngày hợp lệ đứng trước. Không tạo nhãn giờ cập nhật bằng đồng hồ máy người dùng.

## Tải dữ liệu và điều hướng

- Tải khi mở Dashboard, đổi tài khoản/vai trò hoặc bấm làm mới. Không tự tuyên bố realtime, không polling thêm.
- Mỗi nguồn có loading/error/retry; deadline đọc riêng 15 giây, abort khi unmount. 401 gọi logout hiện có. `key` của Overview theo user ID và vai trò, không giữ thống kê admin sau hạ quyền.
- Chỉ gọi GET. Không thêm dữ liệu mock vào ứng dụng, không gọi RAG/model, không tạo/sửa Ticket/KB/users trên Dashboard.
- Lối tắt EMPLOYEE **Tạo yêu cầu hỗ trợ** mở màn hình Ticket hiện có, sau đó người dùng chọn **Tạo yêu cầu**. Giao diện nói rõ hai bước này. Không sửa Ticket để mở form tự động. Các mã trong danh sách Dashboard là văn bản, không giả làm link chi tiết.
- Lối tắt KB/RAG dùng điều hướng App hiện có. Màn hình Quản lý người dùng vẫn là placeholder UI 1; thống kê tài khoản không bổ sung thao tác quản trị.

## File UI 5

- Sửa `src/pages/OverviewPage.jsx`: thay placeholder bằng Dashboard.
- Sửa `src/App.jsx`: truyền token, callback 401 và key theo tài khoản/vai trò vào Overview.
- Tạo `src/components/dashboard/dashboardData.js`: kiểm tra response, lọc phạm vi, đếm và sắp xếp.
- Tạo `src/components/dashboard/useDashboardSource.js`: GET, lifecycle, loading/error/retry riêng từng nguồn.
- Tạo `src/styles/dashboard.css`: bố cục, thẻ, danh sách, biểu đồ thanh, responsive.
- Sửa `scripts/check-ui1.mjs`, `package.json`; tạo `scripts/dashboard-ui-checks.mjs` và tài liệu này. Runner dùng mock GET users cho ADMIN; UI 1 kiểm tra Dashboard thay placeholder cũ, không bỏ các ca hồi quy nghiệp vụ.

Không sửa backend/database, Ticket, KB, RAG, model hoặc API contract trong UI 5.

## Kiểm thử an toàn

Trong thư mục `frontend`:

```powershell
npm run build
npm run test:ui1
npm run test:ui2
npm run test:ui3
npm run test:ui4
npm run test:ui5
```

Tại thư mục project: `git diff --check`.

Runner dùng Edge/Chrome có sẵn và Node hỗ trợ WebSocket. Mọi API bị intercept và trả fixture trong bộ nhớ; request ngoài phạm vi bị chặn. Không dùng dữ liệu/tài khoản thật, không gọi backend/model thật, không ghi database. Fixture không được import từ mã ứng dụng. Ảnh và profile ở `frontend/node_modules/.cache/ui5-check`, được Git bỏ qua.

UI 5 kiểm tra số đếm chính xác với response giả lập, 5 trạng thái riêng biệt, phạm vi nhân viên, hàng đợi IT, phân bố KB/users, ngày tạo/thứ tự/thiếu ngày, loading không giả số 0, lỗi từng nguồn, retry, malformed response, empty arrays, unmount/hạ quyền khi còn request, 401, GET-only, lối tắt và responsive 390/320px cùng bàn phím.

## Kiểm tra website

1. Tải lại website, đăng nhập và mở **Tổng quan**. Nếu frontend chưa chạy: `npm run dev` trong frontend.
2. EMPLOYEE: so sánh tổng, Đang xử lý, Đã giải quyết với danh sách Ticket của mình; kiểm tra Đã đóng được đếm riêng ở biểu đồ.
3. IT: đối chiếu Mới, Ticket mình phụ trách, IN_PROGRESS của mình; danh sách việc không có Ticket CLOSED hoặc việc đã tiếp nhận của IT khác.
4. ADMIN: đối chiếu tổng/phân bố Ticket, KB và tài khoản. Tài khoản chỉ có số khi GET users tải được.
5. Bấm Làm mới từng khối hoặc Làm mới tổng quan. Có thể chặn riêng một URL GET bằng DevTools để kiểm tra lỗi độc lập, rồi bỏ chặn và Thử lại. Không cần sửa dữ liệu.
6. Thử các lối tắt, Tab/Enter và responsive 390px/320px. Mở Ticket/KB từ Dashboard không tự ghi dữ liệu.

## Giới hạn

- Đã kiểm chứng contract từ mã backend và chạy API mock; chưa đối chiếu trực tiếp với database đang chạy.
- Thống kê phía trình duyệt trên toàn danh sách endpoint hiện tại, chưa có endpoint aggregation/pagination. Nếu backend thay pagination, phải cập nhật cách tính; không suy diễn tổng ngoài dữ liệu đã tải.
- Các nguồn độc lập nên không phải snapshot giao dịch chung. Số liệu thay đổi ở nơi khác chỉ cập nhật khi mở lại/làm mới.
- Chưa có SLA, mức hài lòng, uptime, hiệu suất AI, so sánh theo tháng hoặc lịch sử thống kê vì chưa có dữ liệu/contract phù hợp.
- Chưa kiểm thử tải lớn, nhiều trình duyệt hoặc trình đọc màn hình đầy đủ. Chỉ dùng CSS cho biểu đồ, không thêm thư viện.
