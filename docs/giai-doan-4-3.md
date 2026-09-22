# Giai đoạn 4.3 — Seed Knowledge Base và kiểm thử

## Mục tiêu

Tạo tám bài Knowledge Base tiếng Việt để demo API và chuẩn bị dữ liệu cho giai đoạn sau. Không thay schema, không thêm dependency, không sửa API hoặc frontend.

Các bài Knowledge Base trong Giai đoạn 4.3 là dữ liệu demo phục vụ kiểm thử và đồ án, không đại diện cho quy trình CNTT chính thức của một doanh nghiệp cụ thể.

Chưa triển khai frontend Knowledge Base và chưa triển khai RAG.

## File tạo/sửa

Tạo:

- backend/src/utils/knowledgeSeedData.js: tám nội dung demo và dấu nhận diện chủ đề.
- backend/src/utils/seedKnowledge.js: kiểm tra môi trường, user IT, nhận diện bài cũ, tạo/xuất bản qua model GĐ4.2.
- backend/tests/stage4-3-seed.cjs: kiểm thử seed và chạy lại các suite cũ.
- docs/stage4-3-results.json: kết quả thực tế, gồm hồi quy và danh sách bài cuối.
- docs/giai-doan-4-3.md: tài liệu bước này.

Sửa backend/package.json: thêm script seed:knowledge. Không sửa model/controller/routes, test cũ, frontend, SQL hoặc cấu hình chứa secret.

## Cách chạy seed

Trong thư mục backend:

```powershell
npm.cmd run seed:knowledge
```

Điều kiện: MySQL local đang chạy, knowledge_articles đã tồn tại, cấu hình kết nối trong .env hợp lệ. Script từ chối NODE_ENV=production và DB_HOST ngoài các địa chỉ loopback. Script tìm it@test.local theo email, bắt buộc role IT và status ACTIVE; không dùng ID IT cố định. Thiếu hoặc sai tài khoản thì báo lỗi trước khi ghi.

Mỗi bài mới được tạo DRAFT bằng knowledgeArticleModel.create, sau đó chuyển PUBLISHED bằng changeStatus. Mã KB do model sinh từ AUTO_INCREMENT ID; không đặt lại bộ đếm hoặc hard-code mã. created_by và updated_by là ID thực tế của IT demo.

## Tám bài hiện có

| Mã thực tế | Chủ đề | Trạng thái | Số từ theo khoảng trắng |
|---|---|---|---|
| KB-000008 | Không kết nối được Wi-Fi | PUBLISHED | 249 |
| KB-000009 | Máy in không in được tài liệu | PUBLISHED | 267 |
| KB-000010 | Quên mật khẩu tài khoản nội bộ | PUBLISHED | 273 |
| KB-000011 | Không gửi hoặc nhận được email | PUBLISHED | 270 |
| KB-000012 | Máy tính hoạt động chậm | PUBLISHED | 270 |
| KB-000013 | Không truy cập được thư mục mạng nội bộ | PUBLISHED | 269 |
| KB-000014 | Microphone không hoạt động khi họp trực tuyến | PUBLISHED | 262 |
| KB-000015 | Không truy cập được website nội bộ | PUBLISHED | 266 |

Mỗi bài có phần Hiện tượng, Nguyên nhân thường gặp, Các bước kiểm tra/xử lý cơ bản, Khi nào cần gửi Ticket cho IT. Nội dung không chứa địa chỉ máy chủ, domain, tài khoản hoặc chính sách doanh nghiệp giả định.

## Chống duplicate và giữ chỉnh sửa

- Mỗi chủ đề có marker ổn định dạng [DEMO-KB:wifi] nằm trong content, không phải trường database mới.
- Seed tìm bằng tiêu đề gốc HOẶC marker, không dựa vào ID hay code cố định. Đổi tiêu đề vẫn được nhận diện nếu marker còn; viết lại content vẫn được nhận diện nếu tiêu đề gốc còn.
- Bài đã nhận diện được bỏ qua hoàn toàn: giữ code, content, title, status và timestamp, không âm thầm ghi đè.
- Nếu trùng nhiều bài hoặc trùng bài của người tạo khác, seed dừng trước khi tạo mới để người dùng kiểm tra thủ công.
- GET_LOCK trên một connection riêng ngăn các lần chạy seed cùng lúc; khóa được giải phóng trong finally. Việc tạo mã vẫn do model có transaction xử lý.
- Chạy lần hai đã kiểm chứng tạo 0, bỏ qua 8; số lượng và toàn bộ bản ghi giữ nguyên.

Nếu mất cả tiêu đề gốc và marker, script phát hiện có bài của IT demo chưa được nhận diện trong khi thiếu chủ đề seed và dừng trước khi tạo mới. Cách kiểm tra bảo thủ này cũng có thể yêu cầu kiểm tra thủ công nếu IT demo đã tạo bài khác trước lần seed đầu. Không ghi đè hoặc tự đoán bài để sửa. Khóa seed chỉ phối hợp giữa các tiến trình seed, không khóa thao tác tạo bài thủ công qua API.

Nếu một lần chạy gián đoạn giữa tạo và xuất bản, bài DRAFT đã tạo được giữ lại. Seed lần sau không tự xuất bản lại hoặc ghi đè; IT/Admin kiểm tra rồi dùng workflow API. Các bài có sẵn đã đổi sang DRAFT/ARCHIVED cũng được giữ nguyên và seed thông báo rõ.

## Kết quả kiểm thử

Chạy trên MySQL thật, qua npm script và HTTP API thật. Nội dung đã được đọc rà soát; số từ được kiểm tra bằng cách tách khoảng trắng.

| Test | Nội dung | Kết quả |
|---|---|---|
| 1 | npm run seed:knowledge chạy thành công | PASS |
| 2 | Có đúng 8 chủ đề demo | PASS |
| 3 | Cả 8 bài PUBLISHED | PASS |
| 4 | created_by là IT demo | PASS |
| 5 | Tìm IT theo email, không dùng ID cố định | PASS |
| 6 | Code đúng dạng và đúng ID tự tăng thực tế | PASS |
| 7 | Code duy nhất | PASS |
| 8 | Title không rỗng | PASS |
| 9 | Content không rỗng | PASS |
| 10 | Nội dung 150–300 từ, đủ bốn phần, ghi rõ demo | PASS |
| 11 | EMPLOYEE thấy đủ 8 PUBLISHED | PASS |
| 12 | EMPLOYEE xem chi tiết cả 8 bài | PASS |
| 13 | IT thấy đủ bài | PASS |
| 14 | ADMIN thấy đủ bài | PASS |
| 15 | EMPLOYEE không sửa bài | PASS |
| 16 | EMPLOYEE không đổi trạng thái | PASS |
| 17 | Chạy seed lần hai không duplicate | PASS |
| 18 | Sau lần hai vẫn đúng 8 bài demo | PASS |
| 19 | Lần hai giữ code và toàn bộ dữ liệu bài | PASS |
| 20 | Seed giữ nguyên users/Ticket/history | PASS |
| 21 | Response không có password/hash/secret | PASS |
| 22 | Không tạo bảng hoặc dữ liệu RAG | PASS |
| 23 | Script seed không có TRUNCATE/DROP/DELETE | PASS |
| 24 | API 4.2 và lọc trạng thái tiếp tục hoạt động | PASS |
| 25 | Health và DB health hoạt động | PASS |
| B1 | Production bị từ chối trước khi ghi dữ liệu | PASS |
| B2 | Thiếu IT/sai role/INACTIVE bị từ chối | PASS |
| B3 | Giữ nguyên bài đã sửa tiêu đề/nội dung/trạng thái | PASS |
| B4 | Mất cả title gốc và marker: dừng an toàn, không tạo trùng | PASS |

B2 mô phỏng kết quả tìm user để kiểm tra đủ ba nhánh thiếu user/sai role/INACTIVE mà không sửa users thật. B3 tạm biên tập một bài seed, xác minh seed giữ nguyên, rồi khôi phục đúng title/content/status/timestamp trước đó trong finally. Tám bài chính thức được giữ lại sau test; chỉ bài tạm phục vụ kiểm tra API được dọn.

## Hồi quy

Đã chạy nguyên các suite cũ, không sửa điều kiện PASS:

- stage4-2-api.cjs: 25 ca bắt buộc + 5 ca bổ sung PASS; bài tạm được dọn, tám bài seed giữ nguyên.
- stage4-2-regression.cjs gọi stage2-api.cjs: 23 mục PASS (gồm 15 ca bắt buộc).
- Cùng script gọi stage3-api.cjs: 30 mục PASS (gồm 25 ca bắt buộc).
- Auth/JWT/RBAC, quản lý users, Ticket workflow, Knowledge Base API, health và DB health đều hoạt động.
- Báo cáo cũ được khôi phục nguyên bản; kết quả hồi quy lần này lưu trong stage4-3-results.json.
- Đối chiếu toàn bộ bản ghi users/tickets/ticket_history trước và sau kiểm thử: giữ nguyên. Không xóa ba Ticket cũ hoặc user demo. Các bản ghi phụ do suite cũ tạo được dọn theo ID của chính lần kiểm thử.

## Dữ liệu cuối cùng

| Bảng | Số bản ghi |
|---|---|
| users | 3 |
| tickets | 3 |
| ticket_history | 17 |
| knowledge_articles | 8, tất cả PUBLISHED |

Mã bài hiện từ KB-000008 đến KB-000015 vì bộ đếm đã tăng trong kiểm thử GĐ4.2. AUTO_INCREMENT có thể tiếp tục tăng sau các lần test dù bản ghi tạm đã dọn; không đặt lại bộ đếm.

## Chạy lại kiểm thử

Trong backend:

```powershell
node tests/stage4-3-seed.cjs
```

Dùng trên dữ liệu local/demo với ba user đã cấu hình và không sửa dữ liệu đồng thời. Bộ test dành cho trạng thái demo của giai đoạn này: mong đợi đúng tám bài theo nội dung seed. Nếu bạn đã chủ động biên tập hoặc thêm bài khác, seed vẫn giữ dữ liệu nhưng bài kiểm tra nội dung/số lượng có thể không còn khớp; không xóa dữ liệu để ép PASS.

Chưa phát hiện lỗi trong các ca đã chạy. Không kiểm thử hoặc triển khai giao diện Knowledge Base trong bước này. Dừng sau Giai đoạn 4.3, chờ xác nhận trước Giai đoạn 4.4.
