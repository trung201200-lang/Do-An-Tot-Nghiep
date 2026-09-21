# Giai đoạn 4.2 — Backend Knowledge Base API

## Mục tiêu và phạm vi

Tạo, đọc, cập nhật và đổi trạng thái bài viết bằng Express/mysql2, tái sử dụng JWT/RBAC hiện có. Không thêm dependency, không đổi schema, không sửa frontend hay nghiệp vụ Ticket.

**Chưa triển khai frontend Knowledge Base và chưa triển khai RAG.** Không seed bài hướng dẫn chính thức.

## File tạo/sửa

Tạo mới:

- backend/src/models/knowledgeArticleModel.js
- backend/src/controllers/knowledgeArticleController.js
- backend/src/routes/knowledgeArticleRoutes.js
- backend/tests/stage4-2-api.cjs
- backend/tests/stage4-2-regression.cjs
- docs/giai-doan-4-2.md
- docs/stage4-2-api-results.json
- docs/stage4-2-regression-results.json

Sửa backend/src/app.js để mount route và backend/src/middleware/errorMiddleware.js để trả lỗi nghiệp vụ Knowledge Base an toàn. Không sửa bộ test cũ hoặc báo cáo cũ; kết quả hồi quy mới được lưu riêng.

## API và response

Tất cả endpoint yêu cầu `Authorization: Bearer <token>`.

| Method | API | Input | Kết quả |
|---|---|---|---|
| POST | /api/knowledge | title, content | 201; success, message, article |
| GET | /api/knowledge | Không | 200; success, articles |
| GET | /api/knowledge/:id | ID trên URL | 200; success, article |
| PUT | /api/knowledge/:id | title và content đều bắt buộc | 200; success, message, article |
| PATCH | /api/knowledge/:id/status | status | 200; success, article |

Ví dụ tạo/sửa:

```json
{"title":"Hướng dẫn kết nối Wi-Fi","content":"Nội dung hướng dẫn..."}
```

Ví dụ xuất bản:

```json
{"status":"PUBLISHED"}
```

Article gồm các cột của knowledge_articles, creator_name và updater_name. Không SELECT password của users. Response lỗi dùng success=false và message, không chứa lỗi SQL hoặc stack trace.

## RBAC

| Thao tác | EMPLOYEE | IT | ADMIN |
|---|---|---|---|
| Xem danh sách/chi tiết | Chỉ PUBLISHED | Mọi trạng thái | Mọi trạng thái |
| Tạo bài | Không | Có | Có |
| Cập nhật title/content | Không | Có | Có |
| Đổi trạng thái | Không | Có | Có |

EMPLOYEE gọi trực tiếp DRAFT/ARCHIVED nhận 403; danh sách luôn lọc PUBLISHED ở SQL, không phụ thuộc query string do client gửi. Không có API xóa bài.

## Mã bài viết và trạng thái

Bài mới luôn DRAFT, created_by lấy từ req.user.id, updated_by ban đầu NULL. Backend insert mã tạm ngẫu nhiên, lấy insertId, đổi sang KB-000001 trong cùng transaction rồi commit. UNIQUE của code vẫn là chốt kiểm tra cuối; không dùng MAX(id), không cần migration. Mã có thể nhảy số do kiểm thử hoặc rollback.

Workflow duy nhất:

```text
DRAFT → PUBLISHED → ARCHIVED → DRAFT
```

Chuyển sai luồng hoặc giữ nguyên trạng thái bị từ chối 400. Đổi trạng thái khóa dòng bằng SELECT ... FOR UPDATE để tránh hai request cùng thực hiện một transition. updated_by luôn lấy từ tài khoản thực hiện; updated_at do MySQL tự quản lý. PUT chỉ sửa nội dung, không đổi status hoặc creator/code. IT/ADMIN có thể sửa nội dung ở cả ba trạng thái theo phạm vi yêu cầu.

## Validation và mã lỗi

- Chỉ chấp nhận đúng các trường input của từng endpoint; từ chối id/code/status hoặc trường audit do client gửi vào POST/PUT.
- Title/content phải là chuỗi, trim và không rỗng. Title tối đa 255 ký tự Unicode; content không vượt 65535 byte UTF-8 của MySQL TEXT.
- Giữ giới hạn JSON toàn ứng dụng hiện có là 16 KB; payload vượt giới hạn trả 413. Giới hạn request này có thể đạt trước giới hạn TEXT.
- ID phải là số nguyên dương trong phạm vi INT; sai ID hoặc input trả 400.
- Không tồn tại: 404. Thiếu/sai token: 401. Sai quyền: 403.
- Trùng code hiếm gặp: 409, transaction rollback, client có thể gửi lại.
- Các giá trị đầu vào trong truy vấn đều dùng tham số mysql2.

## Kiểm thử Knowledge Base

Đã chạy node tests/stage4-2-api.cjs trên MySQL thật. Các ca bắt buộc 1–25 và năm ca bổ sung đều PASS:

| Test | Nội dung | Kết quả |
|---|---|---|
| 1 | Thiếu token -> 401 ở mọi endpoint | PASS |
| 2 | EMPLOYEE không tạo bài -> 403 | PASS |
| 3 | IT tạo bài thành công | PASS |
| 4 | Bài mới là DRAFT | PASS |
| 5 | Code dạng KB-xxxxxx | PASS |
| 6 | created_by đúng IT | PASS |
| 7 | ADMIN tạo bài | PASS |
| 8 | EMPLOYEE không thấy DRAFT trong danh sách | PASS |
| 9 | IT thấy DRAFT | PASS |
| 10 | ADMIN thấy DRAFT | PASS |
| 11 | EMPLOYEE không xem trực tiếp DRAFT | PASS |
| 12 | IT cập nhật title/content | PASS |
| 13 | updated_by đúng người cập nhật | PASS |
| 14 | EMPLOYEE không được update hoặc đổi status | PASS |
| 15 | DRAFT -> PUBLISHED | PASS |
| 16 | EMPLOYEE thấy PUBLISHED | PASS |
| 17 | EMPLOYEE xem chi tiết PUBLISHED | PASS |
| 18 | PUBLISHED -> ARCHIVED | PASS |
| 19 | EMPLOYEE không thấy ARCHIVED | PASS |
| 20 | ARCHIVED -> DRAFT | PASS |
| 21 | Chặn mọi transition không hợp lệ | PASS |
| 22 | Chặn title rỗng, sai kiểu hoặc quá dài | PASS |
| 23 | Chặn content rỗng hoặc sai kiểu | PASS |
| 24 | ID không tồn tại -> 404 | PASS |
| 25 | Mọi response không lộ password/hash/secret/stack/SQL | PASS |
| B1 | Chặn trường chỉ server được quyết định | PASS |
| B2 | ADMIN sửa bài, giữ code/creator, truy vấn tham số an toàn | PASS |
| B3 | ID/status/body không hợp lệ -> 400 | PASS |
| B4 | Tạo đồng thời không trùng mã | PASS |
| B5 | Publish đồng thời chỉ một request hợp lệ | PASS |

Script tạo 7 bài tạm qua API, sau đó xóa đúng các ID do lần chạy tạo và đối chiếu dữ liệu với trước kiểm thử. knowledge_articles trở lại 0 bản ghi. Mật khẩu/token/secret không được ghi trong báo cáo.

## Hồi quy

Đã chạy node tests/stage4-2-regression.cjs. Script gọi nguyên backend/tests/stage2-api.cjs và backend/tests/stage3-api.cjs, không sửa logic hoặc điều kiện PASS của test cũ.

- Giai đoạn 2: 15/15 ca yêu cầu và các ca bổ sung PASS (23 mục kiểm tra).
- Giai đoạn 3: 25/25 ca yêu cầu và 5 ca bổ sung PASS (30 mục kiểm tra).
- /api/health, /api/health/db, login ba role, /api/auth/me, RBAC và các API users/Ticket đều tiếp tục hoạt động.
- Dọn riêng hai Ticket mới mà bộ test Giai đoạn 3 giữ lại và lịch sử của chúng. Không xóa Ticket có sẵn.
- Khôi phục timestamp của tài khoản demo đã tạm đổi trạng thái trong test sau khi xác nhận các trường khác nguyên vẹn; đối chiếu toàn bộ bản ghi users, tickets, ticket_history và knowledge_articles trước/sau.
- Dữ liệu cuối: 3 users, 3 tickets, 17 ticket_history, 0 knowledge_articles; các bản ghi cũ giữ nguyên. Bộ đếm AUTO_INCREMENT có thể tăng sau khi tạo/dọn dữ liệu test.
- Không kiểm thử frontend trong bước này vì không thay đổi frontend.

## Chạy lại kiểm thử

Điều kiện: MySQL local, bảng Giai đoạn 1–4.1 đã được tạo, ba tài khoản demo có mật khẩu khớp cấu hình seed local. Không chạy đồng thời với việc sửa dữ liệu demo.

Trong backend:

```powershell
node tests/stage4-2-api.cjs
node tests/stage4-2-regression.cjs
```

Hai script sử dụng cổng HTTP tạm và tự dừng server sau khi hoàn tất. Dữ liệu phát sinh phục vụ kiểm thử, không phải seed chính thức. Không dùng TRUNCATE hoặc thay schema.

## Giới hạn và điểm dừng

Chưa có phân trang, tìm kiếm nâng cao, lịch sử phiên bản bài viết, frontend Knowledge Base hoặc RAG. Danh sách hiện trả đầy đủ nội dung theo quyền. Chưa phát hiện lỗi trong phạm vi các ca đã chạy. Dừng sau Giai đoạn 4.2, chờ người dùng xác nhận trước Giai đoạn 4.3.
