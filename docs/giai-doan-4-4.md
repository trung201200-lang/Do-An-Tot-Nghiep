# Giai đoạn 4.4 – Frontend Knowledge Base

## Mục tiêu và phạm vi

Xây dựng giao diện Kho kiến thức bằng React, dùng API thật GĐ4.2 và dữ liệu MySQL GĐ4.3. Tái sử dụng JWT, API helper và phong cách giao diện hiện tại. Không thêm dependency, không sửa backend nghiệp vụ hoặc schema. Ticket vẫn là tab mặc định sau đăng nhập. README tổng thể chưa thay đổi.

Trước triển khai đã xác nhận branch main, working tree sạch, HEAD 51cd5cf và đồng bộ origin/main.

## File tạo và sửa

Tạo:

- frontend/src/KnowledgeBase.jsx: danh sách, tìm kiếm, chi tiết, form tạo/sửa, đổi trạng thái.
- backend/tests/stage4-4-browser.cjs: kiểm thử Edge headless với API/MySQL thật.
- backend/tests/stage4-4-regression.cjs: chạy kiểm thử cũ, seed và đối chiếu dữ liệu.
- docs/giai-doan-4-4.md: tài liệu này.
- docs/stage4-4-browser-results.json: kết quả 35 test và 4 test bổ sung.
- docs/stage4-4-regression-results.json: kết quả hồi quy.
- docs/stage4-4-knowledge.png: ảnh giao diện Employee từ lượt test thành công.

Sửa:

- frontend/src/App.jsx: thêm tab Kho kiến thức, giữ đăng nhập/đăng xuất và Ticket.
- frontend/src/style.css: style Kho kiến thức, trạng thái, bố cục màn hình nhỏ.

## Giao diện theo quyền

| Role | Chức năng Knowledge Base |
| --- | --- |
| EMPLOYEE | Đọc bài PUBLISHED: danh sách, tìm kiếm, chi tiết đầy đủ và quay lại. Không có nút tạo, sửa hoặc đổi trạng thái. |
| IT | Xem mọi trạng thái, người tạo/người cập nhật; tạo, sửa tiêu đề/nội dung và đổi trạng thái. |
| ADMIN | Quyền Knowledge Base giống IT; giữ chức năng Ticket và API quản lý user cũ. |

Backend quyết định quyền cuối cùng. Frontend không hard-code mã hoặc nội dung tám bài seed. Quản lý user trước GĐ4.4 chỉ có API, chưa có giao diện/menu riêng; giai đoạn này không bổ sung giao diện quản lý user. Test 29 kiểm tra API hiện có bằng phiên ADMIN thật.

## Tìm kiếm

Search hiện tại là tìm kiếm từ khóa phía frontend trên danh sách Knowledge Base mà API trả về. Đây chưa phải Semantic Search hoặc RAG.

Đây là tìm kiếm từ khóa phía frontend, chưa phải RAG.

Lọc theo code và title, bỏ khoảng trắng đầu/cuối, không phân biệt hoa/thường. Từ khóa rỗng hiển thị toàn bộ danh sách API cho phép role hiện tại xem. Không tìm trong content, không bỏ dấu tiếng Việt, không gọi thêm API tìm kiếm.

## Tạo, sửa và đổi trạng thái

| Thao tác | API được tái sử dụng | Dữ liệu gửi |
| --- | --- | --- |
| Danh sách | GET /api/knowledge | Không có body |
| Chi tiết | GET /api/knowledge/:id | Không có body |
| Tạo | POST /api/knowledge | title, content |
| Sửa | PUT /api/knowledge/:id | title, content |
| Đổi trạng thái | PATCH /api/knowledge/:id/status | status |

Form chỉ có tiêu đề và nội dung; chặn rỗng/chỉ khoảng trắng, giới hạn tiêu đề 255 ký tự và kiểm tra kích thước JSON theo giới hạn 16 KB hiện có của backend. Backend tự sinh code và tạo bài DRAFT. Sửa không gửi code/status hoặc thông tin tác giả.

Workflow và nút tương ứng:

- DRAFT → PUBLISHED: Xuất bản.
- PUBLISHED → ARCHIVED: Lưu trữ.
- ARCHIVED → DRAFT: Chuyển về bản nháp.

Chỉ cập nhật giao diện bằng dữ liệu backend đã xác nhận thành công, sau đó tải lại chi tiết và danh sách. Có thông báo thành công, khóa nút khi gửi để tránh submit lặp. Nội dung hiển thị dạng văn bản, giữ xuống dòng.

Có trạng thái đang tải, danh sách rỗng, tìm kiếm không có kết quả và nút làm mới. HTTP 401 xóa phiên và quay lại đăng nhập; 403/404 hiển thị thông báo, đóng chi tiết; 500 hiển thị lỗi tiếng Việt thân thiện. Không log token hoặc lưu mật khẩu. Đã kiểm tra chiều rộng 390px không tràn ngang.

## Kết quả browser test

Ngày kiểm thử: 22/09/2026 (UTC), Microsoft Edge headless. Đăng nhập tài khoản demo thật của cả ba role; luồng chính dùng backend và MySQL thật. Riêng lỗi 401/403/404/500, trì hoãn phản hồi và danh sách rỗng được mô phỏng bằng chặn response trong trình duyệt để kiểm tra giao diện.

| Test | Nội dung | Kết quả |
| --- | --- | --- |
| 1 | Login Employee | PASS |
| 2 | Employee có mục Kho kiến thức | PASS |
| 3 | Employee mở Kho kiến thức | PASS |
| 4 | Hiển thị đúng 8 bài PUBLISHED từ API | PASS |
| 5 | Employee không có Tạo bài | PASS |
| 6 | Employee không có Sửa bài | PASS |
| 7 | Employee không có nút đổi trạng thái | PASS |
| 8 | Search Wi-Fi, không phân biệt hoa thường, trim | PASS |
| 9 | Search không có kết quả | PASS |
| 10 | Employee mở chi tiết | PASS |
| 11 | Hiển thị đủ nội dung và giữ xuống dòng | PASS |
| 12 | Quay lại danh sách | PASS |
| 13 | Login IT | PASS |
| 14 | IT có mục Kho kiến thức | PASS |
| 15 | IT thấy danh sách | PASS |
| 16 | IT có nút Tạo bài | PASS |
| 17 | IT tạo bài mới DRAFT | PASS |
| 18 | IT mở chi tiết bài vừa tạo | PASS |
| 19 | IT sửa title/content, giữ code/status | PASS |
| 20 | DRAFT -> PUBLISHED | PASS |
| 21 | PUBLISHED -> ARCHIVED | PASS |
| 22 | ARCHIVED -> DRAFT | PASS |
| 23 | IT tìm theo code | PASS |
| 24 | Login ADMIN | PASS |
| 25 | ADMIN có mục Kho kiến thức | PASS |
| 26 | ADMIN xem đủ ba trạng thái | PASS |
| 27 | ADMIN tạo/sửa bài | PASS |
| 28 | ADMIN đổi trạng thái đủ workflow | PASS |
| 29 | API quản lý user ADMIN cũ hoạt động | PASS |
| 30 | Tab Ticket và chi tiết cũ hoạt động | PASS |
| 31 | Frontend build | PASS |
| 32 | Không lỗi JavaScript nghiêm trọng | PASS |
| 33 | Frontend không hard-code tám bài | PASS |
| 34 | Employee không có chức năng quản trị, không thấy bài tạm chưa xuất bản | PASS |
| 35 | Reload giữ phiên đăng nhập | PASS |
| B1 | Màn hình 390px không tràn ngang | PASS |
| B2 | Loading, lỗi 500 thân thiện, thử lại và danh sách rỗng | PASS |
| B3 | 403/404 hiển thị thông báo, không mở chi tiết | PASS |
| B4 | 401 xóa phiên và quay lại Login | PASS |

Lượt đầu có lỗi đồng bộ trong script mô phỏng response chậm; đã sửa cách chờ route hoàn tất và chạy lại toàn bộ. Lượt cuối exit code 0, 35/35 test bắt buộc và 4/4 test bổ sung PASS. Frontend build PASS. Không sửa test cũ để đạt PASS.

## Hồi quy

| Phạm vi | Kết quả |
| --- | --- |
| GĐ1: /api/health và /api/health/db, MySQL thật | PASS, nằm trong bộ API GĐ2 |
| GĐ2: Auth/JWT/RBAC/User API/bcrypt | 23/23 PASS |
| GĐ2: đăng nhập, reload, đăng xuất, JWT lỗi/hết hạn trên Edge | 7/7 PASS |
| GĐ3: Ticket API, workflow, quyền, history, transaction | 30/30 PASS |
| GĐ3: giao diện Ticket ba role | 5/5 PASS |
| GĐ4.2: Knowledge Base API | 30/30 PASS |
| GĐ4.3: chạy seed:knowledge hai lần | PASS; mỗi lần tạo 0, bỏ qua 8 bài |

Chỉ chạy kiểm tra seed/idempotency an toàn GĐ4.3; không chạy toàn bộ kịch bản có sửa thử bài seed. Script hồi quy giữ nguyên các báo cáo cũ sau khi lấy kết quả vào báo cáo GĐ4.4.

## Dữ liệu sau kiểm thử

| Bảng | Số bản ghi cuối cùng |
| --- | --- |
| users | 3 |
| tickets | 3 |
| ticket_history | 17 |
| knowledge_articles | 8 |

Tám bài seed KB-000008 đến KB-000015 vẫn PUBLISHED, created_by là tài khoản it@test.local. Đối chiếu toàn bộ bản ghi trước/sau xác nhận dữ liệu gốc, nội dung và metadata còn nguyên. Các bài và Ticket tạm do kiểm thử tạo đã được dọn theo ID xác định, không TRUNCATE, không thêm DELETE endpoint. Bộ đếm AUTO_INCREMENT có thể tăng do tạo/xóa dữ liệu test; không đặt lại bộ đếm.

## Chạy lại kiểm thử

Tại thư mục backend:

```powershell
node tests/stage4-4-browser.cjs
node tests/stage4-4-regression.cjs
```

Yêu cầu MySQL và backend/.env hiện có, Microsoft Edge, Playwright đã có tại thư mục tạm it-support-browser-check/node_modules/playwright và cổng 5173 trống. Script tự khởi động backend/Vite phục vụ kiểm thử và dừng khi hoàn tất. Không thêm Playwright vào dependency dự án. Mật khẩu demo lấy từ SEED_USER_PASSWORD, không ghi vào source hoặc báo cáo.

Các script kiểm tra trạng thái demo 3/3/17/8 trước khi chạy và dừng nếu số lượng khác; không tự xóa dữ liệu hợp lệ người dùng thêm. Chạy trong môi trường demo không có người khác ghi dữ liệu đồng thời để đối chiếu trước/sau chính xác.

## Giới hạn và điểm dừng

Không phát hiện lỗi còn tồn tại trong phạm vi đã kiểm thử. Tìm kiếm chỉ khớp chuỗi code/title; chưa phân trang hoặc cập nhật thời gian thực. Dùng nút làm mới để lấy thay đổi từ người khác. Giới hạn request 16 KB của backend vẫn áp dụng. Reload giữ phiên nhưng trở về tab Ticket theo luồng hiện tại; đổi tab không lưu bản nháp form chưa gửi.

Chưa triển khai RAG, Embedding, Vector Search, Qdrant hoặc LLM.

GĐ4.4 hoàn thành; dừng tại đây, không triển khai GĐ4.5 và chưa đánh dấu toàn bộ GĐ4 hoàn thành.
