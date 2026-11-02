# UI 3 — Kho kiến thức

## Giao diện và phạm vi

- Dùng AppShell, design tokens, Button, Badge, Alert, LoadingState và EmptyState hiện có. Chỉ cập nhật frontend; không đổi backend, dữ liệu KB, Ticket hoặc RAG.
- Danh sách dạng thẻ với mã, tiêu đề, badge chữ cho Bản nháp / Đã xuất bản / Đã lưu trữ, ngày cập nhật và thông tin tác giả theo vai trò.
- Tìm chuỗi mã/tiêu đề không phân biệt hoa thường; lọc trạng thái cho IT/ADMIN. Xử lý trên danh sách API trả về, không tìm theo ngữ nghĩa, không thêm tham số API. Giữ bộ lọc khi quay lại từ chi tiết.
- Trang đọc tách nội dung, metadata và thao tác quản lý; giữ nguyên văn bản, dấu xuống dòng và React escaping. Không render HTML/Markdown, không thay đổi hoặc viết lại nội dung nguồn.
- Form tạo/sửa có lỗi tại trường, focus trường lỗi, đếm ký tự Unicode và giữ nội dung khi API báo lỗi. API không cung cấp lỗi riêng từng trường nên lỗi server hiển thị bằng Alert chung.
- Hộp thoại xác nhận trước chuyển trạng thái, lưu sửa bài PUBLISHED và bỏ thay đổi chưa lưu qua nút Hủy. Hỗ trợ Escape, vòng Tab/Shift+Tab, focus ban đầu ở nút hủy và trả focus về nơi mở. Không tự lưu nháp vào trình duyệt.
- Loading, lỗi tải kèm thử lại, danh sách rỗng và không có kết quả tìm kiếm được phân biệt. Sau POST/PUT/PATCH thành công, hiển thị dữ liệu đã được backend xác nhận; lỗi tải lại được báo riêng, không giữ form tạo để gửi trùng.

## API, quyền và validation

| Thao tác | Endpoint / payload | Quyền |
| --- | --- | --- |
| Danh sách | GET `/knowledge` | EMPLOYEE chỉ PUBLISHED; IT/ADMIN tất cả |
| Chi tiết | GET `/knowledge/:id` | Theo quyền xem của backend |
| Tạo bản nháp | POST `/knowledge`, `{title, content}` | IT/ADMIN |
| Sửa nội dung | PUT `/knowledge/:id`, `{title, content}` | IT/ADMIN, cả ba trạng thái |
| Chuyển trạng thái | PATCH `/knowledge/:id/status`, `{status}` | IT/ADMIN |

Chu trình duy nhất: **DRAFT → PUBLISHED → ARCHIVED → DRAFT**. Không bổ sung xóa hoặc chuyển trạng thái trực tiếp ngoài chu trình. EMPLOYEE không có bộ lọc quản lý hoặc nút ghi. Backend vẫn là nơi thực thi phân quyền; frontend cũng không render bài ngoài PUBLISHED cho EMPLOYEE. Luồng 401/logout và việc cập nhật vai trò từ `/auth/me` giữ nguyên.

Payload tạo/sửa vẫn trim đầu/cuối như trước. Tiêu đề tối đa 255 Unicode code points (`[...title].length`), không dùng `maxLength` UTF-16 làm giới hạn thay thế. Toàn bộ JSON gửi lên tối đa 16 × 1024 byte UTF-8, tương ứng body parser backend. Giới hạn này chặt hơn giới hạn riêng 65535 byte cho content trong controller. Test kiểm tra emoji và nội dung tiếng Việt nhiều byte.

## Chạy kiểm thử an toàn

Trong `frontend`:

```powershell
npm run build
npm run test:ui1
npm run test:ui2
npm run test:ui3
```

Trong thư mục project:

```powershell
git diff --check
```

Các bộ test dùng Node hỗ trợ WebSocket và Edge/Chrome cài sẵn. Runner phục vụ bản build trên cổng loopback tạm, intercept toàn bộ request của trang; mọi API dùng dữ liệu giả lập trong bộ nhớ. Request ngoài phạm vi bị chặn. Không dùng tài khoản thật, backend, database, Gemini hoặc Ollama. Không cài package. Build lại trước khi chạy để test đúng mã hiện tại.

UI 3 kiểm tra ba vai trò, loading/list/search/filter, badge, chi tiết/metadata/văn bản an toàn, quyền sửa cả ba trạng thái, tạo/sửa, giới hạn Unicode/16 KB, xác nhận/chuyển trạng thái, giữ form khi lỗi 400/403/404/413/500, 401/logout, lỗi tải lại sau khi ghi, hạ quyền trong phiên, bàn phím, mobile 390/320px. Fixture chỉ được import bởi script test, không nằm trong ứng dụng thật.

Ảnh kiểm thử và profile riêng ở `frontend/node_modules/.cache/ui3-check`, được Git bỏ qua. Không commit các artifact này.

## Kiểm tra thủ công

1. Mở website đang chạy, vào **Kho kiến thức**. Nếu frontend chưa chạy, dùng `npm run dev` trong thư mục frontend.
2. Với EMPLOYEE: chỉ thấy bài đã xuất bản, tìm theo mã/tiêu đề, mở bài và quay lại; không có nút tạo/sửa/chuyển trạng thái hoặc bộ lọc trạng thái.
3. Với IT/ADMIN: thử kết hợp tìm kiếm và từng bộ lọc; mở bài để kiểm tra badge, nội dung xuống dòng, tác giả và ngày cập nhật.
4. Mở **Tạo bài viết**, gửi trống để kiểm tra lỗi tại trường. Nhập nội dung rồi Hủy: chọn tiếp tục soạn phải giữ nguyên nội dung. Chỉ bấm Lưu dữ liệu hợp lệ khi chủ động muốn tạo/sửa bài thật.
5. Kiểm tra nút tương ứng từng trạng thái. Mở hộp xác nhận rồi Hủy/Escape để kiểm tra an toàn mà không ghi dữ liệu. Xác nhận xuất bản/lưu trữ/chuyển về nháp sẽ thay đổi dữ liệu thật.
6. Thử Tab, Shift+Tab, Enter và Escape. Thu nhỏ ở 390px/320px; kiểm tra danh sách, nội dung, form và hộp thoại không tràn ngang.

## Giới hạn

- Chưa kiểm thử ghi dữ liệu thật, trình đọc màn hình đầy đủ hoặc tải lớn.
- Tìm kiếm/lọc ở phía trình duyệt; chưa có phân trang server vì contract hiện tại không hỗ trợ.
- Không có rich text, Markdown preview, tự lưu nháp hoặc khôi phục form sau reload/đăng xuất. Dữ liệu form được giữ khi API lỗi trong phiên màn hình hiện tại; rời menu hoặc reload không có cơ chế lưu nháp.
- Chưa thêm kiểm soát sửa đồng thời/versioning; tiếp tục dùng contract backend hiện có.
