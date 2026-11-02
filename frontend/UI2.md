# UI 2 — Quản lý yêu cầu hỗ trợ

## Phạm vi

- Giữ AppShell, đăng nhập, sessionStorage, `/auth/me`, xử lý 401 và logout của UI 1.
- Tìm kiếm mã/tiêu đề không phân biệt hoa thường; kết hợp bộ lọc trạng thái và ưu tiên ngay trên danh sách API trả về. Không bổ sung query parameter hay thay đổi phạm vi dữ liệu theo quyền.
- Desktop dùng bảng cuộn ngang có thể focus; mobile dùng thẻ. Có trạng thái đang tải, lỗi tải kèm thử lại, danh sách rỗng và không có kết quả tìm kiếm riêng biệt.
- Màn hình tạo có lỗi tại trường, giới hạn tiêu đề 255 ký tự, mô tả 4000 ký tự, kiểm tra khoảng trắng và chuyển focus tới trường lỗi. Giới hạn dùng độ dài chuỗi JavaScript giống backend hiện tại.
- Chi tiết có mô tả, giải pháp, người tạo, người phụ trách, trạng thái, ưu tiên, ngày tạo/cập nhật và timeline từ `history` của API. Không tự tạo sự kiện lịch sử.
- Chuyển focus khi mở chi tiết/tạo; quay về nút mở Ticket khi trở lại danh sách. Bộ lọc được giữ trong lần truy cập màn hình.

## Quyền và API được giữ nguyên

| Vai trò | Tạo | Tiếp nhận Ticket mới | Đổi ưu tiên | Chuyển trạng thái |
| --- | --- | --- | --- | --- |
| EMPLOYEE | Có | Không | Không | Không |
| IT | Không | Có | Chưa có người phụ trách hoặc do chính mình phụ trách, chưa đóng | Do chính mình phụ trách |
| ADMIN | Không | Có | Mọi Ticket chưa đóng | Mọi Ticket có chuyển trạng thái hợp lệ |

Ticket đã đóng chỉ được xem. Các chuyển trạng thái: tiếp nhận `NEW → RECEIVED`, bắt đầu `RECEIVED → IN_PROGRESS`, giải quyết kèm giải pháp `IN_PROGRESS → RESOLVED`, đóng `RESOLVED → CLOSED`, xử lý lại `RESOLVED → IN_PROGRESS`. Không có giao tùy ý hoặc xóa.

API giữ nguyên: `GET /tickets`, `GET /tickets/:id`, `POST /tickets` với `title, description`, `PATCH /tickets/:id/accept` với `{}`, `PATCH /tickets/:id/priority` với `priority`, `PATCH /tickets/:id/status` với `status` và `solution` khi giải quyết.

Nếu POST thành công nhưng tải chi tiết lỗi, form tạo được đóng và Ticket được giữ trong danh sách để tránh gửi trùng. Nếu PATCH thành công nhưng tải chi tiết lỗi, giao diện yêu cầu làm mới chi tiết trước khi thao tác tiếp. Lỗi chung từ API hiển thị bằng Alert; API hiện không cung cấp lỗi theo từng trường nên không đoán trường lỗi từ thông báo server.

## Kiểm thử an toàn

Tại thư mục `frontend`:

```powershell
npm run build
npm run test:ui1
npm run test:ui2
```

Tại thư mục project:

```powershell
git diff --check
```

Hai bộ test dùng Node có WebSocket tích hợp và Edge/Chrome cài sẵn. Runner phục vụ bản build trên cổng loopback tạm; chặn mọi request của trang bằng CDP. Toàn bộ API dùng fixture trong bộ nhớ; request ngoài phạm vi bị chặn. Không cần backend, database hoặc model, không dùng tài khoản thật và không cài thêm package. Phải build lại trước khi chạy test để tránh kiểm tra bản build cũ.

UI 2 kiểm tra tìm kiếm/lọc, dữ liệu rỗng, lỗi API, validation, tạo thành công/thất bại, chống gửi trùng, chi tiết/lịch sử, ba vai trò, chuyển trạng thái, lỗi 403/404/409/401, lỗi tải lại sau khi lưu, bàn phím và responsive 390/320px. UI 1 tiếp tục kiểm tra đăng nhập, session, sidebar và các màn hình nghiệp vụ với API giả lập.

Ảnh kiểm thử và profile trình duyệt nằm dưới `frontend/node_modules/.cache/ui1-check` hoặc `ui2-check`, được Git bỏ qua. Không đưa các artifact này vào commit. Fixture chỉ được import từ script test, không từ mã ứng dụng.

## Kiểm tra thủ công

1. Mở website đang chạy (hoặc chạy `npm run dev` trong frontend nếu cần), đăng nhập bằng tài khoản của bạn, chọn **Yêu cầu hỗ trợ**.
2. Tìm bằng mã hoặc tiêu đề, kết hợp hai bộ lọc, thử không có kết quả và xóa bộ lọc. Mở chi tiết rồi quay lại; bộ lọc phải còn nguyên.
3. Với EMPLOYEE: mở **Tạo yêu cầu**, gửi form trống hoặc chỉ có khoảng trắng để xem lỗi; thử Tab/Shift+Tab/Enter. Chỉ gửi dữ liệu hợp lệ khi chủ động muốn tạo Ticket thật.
4. Với IT: kiểm tra Ticket mới, Ticket của mình, Ticket của IT khác và Ticket đã đóng. Với ADMIN: kiểm tra khả năng xử lý Ticket của người khác. Chỉ thực hiện thao tác cập nhật khi chủ động muốn thay đổi dữ liệu thật.
5. Đối chiếu timeline với lịch sử API; bài không có lịch sử phải hiển thị thông báo rõ ràng.
6. Kiểm tra trên desktop và DevTools ở 390px/320px, thao tác menu và bàn phím; trang không tràn ngang, bảng dài trên desktop cuộn trong vùng bảng.

Chưa kiểm thử ghi dữ liệu thật, tải lớn hoặc đầy đủ với trình đọc màn hình. Tìm/lọc hiện hoạt động phía trình duyệt, chưa có phân trang server vì API hiện tại chưa hỗ trợ.
