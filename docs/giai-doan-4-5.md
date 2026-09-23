# Giai đoạn 4.5 – Hoàn thiện Knowledge Base và kiểm thử tổng

## Mục tiêu và kết luận

Giai đoạn 4 hoàn thiện chức năng Knowledge Base truyền thống. Tìm kiếm hiện tại là tìm kiếm từ khóa phía frontend và chưa phải RAG.

RAG, Chunking, Embedding, Vector Search và LLM chưa được triển khai trong Giai đoạn 4.

Đã rà soát code, tài liệu GĐ4.1–4.4; chạy lại API/browser/build và seed an toàn. Không phát hiện lỗi nghiệp vụ nghiêm trọng hoặc lỗi còn tồn tại trong các ca đã kiểm tra. Hoàn thành GĐ4.5, dừng trước GĐ5.

## Điều kiện Git ban đầu

Branch main, working tree sạch, HEAD 73feef4 (feat: add knowledge base frontend). Đã kiểm tra hash remote refs/heads/main trùng local trước khi sửa. Không reset hoặc sửa lịch sử Git.

## Tổng kết các bước Giai đoạn 4

| Bước | Kết quả đã có |
| --- | --- |
| 4.1 | knowledge_articles: id tự tăng, code UNIQUE, title/content, enum status mặc định DRAFT, created_by/updated_by liên kết users, ON DELETE RESTRICT, timestamp |
| 4.2 | Model/controller/routes; năm endpoint KB; JWT/RBAC, validation, workflow, transaction và khóa dòng |
| 4.3 | Tám bài demo tiếng Việt, seed dùng IT demo và model hiện có; nhận diện qua title/marker, không ghi đè bài có sẵn |
| 4.4 | React KnowledgeBase.jsx: tab, danh sách, chi tiết, search, tạo/sửa/status theo role; loading/error/empty, kiểm thử Edge |
| 4.5 | Rà soát tổng, hồi quy, kiểm tra dữ liệu/bảo mật cơ bản, cập nhật README và tổng kết |

Tài liệu 4.2/4.3 ghi chưa có frontend và tài liệu 4.4 ghi chưa hoàn thành toàn bộ GĐ4 là thông tin lịch sử tại thời điểm từng bước, không phải trạng thái hiện tại. README trước đây còn ghi chưa có Knowledge Base nên đã được cập nhật.

## Kiến trúc Knowledge Base

Luồng request thực tế:

```text
React KnowledgeBase.jsx
  → apiRequest + Bearer JWT
  → /api/knowledge (Express routes)
  → authenticate + authorizeRoles
  → knowledgeArticleController (validation)
  → knowledgeArticleModel (truy vấn tham số/transaction)
  → MySQL knowledge_articles → users (FK tác giả)
```

Response đi ngược về frontend: danh sách trả articles, chi tiết/tạo/sửa/status trả article. Middleware xác minh JWT, đọc trạng thái và quyền hiện tại của user từ database. Model giới hạn EMPLOYEE chỉ đọc PUBLISHED.

| Method | Endpoint | Input |
| --- | --- | --- |
| POST | /api/knowledge | title, content |
| GET | /api/knowledge | Không có body |
| GET | /api/knowledge/:id | ID |
| PUT | /api/knowledge/:id | title, content |
| PATCH | /api/knowledge/:id/status | status |

## Phân quyền và workflow

| Role | Đọc | Tạo | Sửa | Đổi trạng thái |
| --- | --- | --- | --- | --- |
| EMPLOYEE | Chỉ PUBLISHED | Không | Không | Không |
| IT | Mọi trạng thái | Có | Có | Có |
| ADMIN | Mọi trạng thái | Có | Có | Có |

```text
DRAFT → PUBLISHED → ARCHIVED → DRAFT
```

Bài mới DRAFT, code sinh từ insertId trong transaction, không giả định ID bắt đầu từ 1. PUT chỉ đổi title/content, giữ code/creator/status. PATCH khóa dòng và chỉ cho phép bước tiếp theo; audit lấy từ user xác thực. Không thêm endpoint, không sửa workflow.

## Seed data và tìm kiếm

Tám chủ đề: Wi-Fi, máy in, quên mật khẩu, email, máy tính chậm, thư mục mạng, microphone và website nội bộ. Mọi bài hiện PUBLISHED, created_by trỏ đúng tài khoản it@test.local (role IT, ACTIVE).

Kiểm tra mã bằng dữ liệu thực tế và mẫu KB- theo ID, không hard-code mã bắt đầu. Seed tìm user theo email, nhận diện bài qua title gốc hoặc marker. Hai lần chạy npm run seed:knowledge thật đều tạo 0, bỏ qua 8; toàn bộ bản ghi giữ nguyên.

Kiểm tra không ghi đè nội dung đã sửa dùng mô phỏng kết quả đọc database trong bộ nhớ: tám bài có title/content đã biên tập và status ARCHIVED vẫn được bỏ qua, model không được gọi để ghi. Các hàm được khôi phục trong finally. Đây là kiểm tra mô phỏng, không đổi trạng thái hay nội dung tám bài thật. Không chạy lại toàn bộ stage4-3-seed.cjs vì các ca B3/B4 của script đó tạm biên tập bài seed thật.

Keyword Search ≠ Semantic Search ≠ RAG. Hiện frontend lọc code/title trên danh sách API trả về, trim khoảng trắng và không phân biệt hoa/thường. Từ khóa rỗng hiển thị toàn bộ danh sách được phép xem; không có kết quả thì hiển thị thông báo rỗng. Không tìm content, không bỏ dấu và không truy xuất/sinh nội dung bằng AI.

## Kiểm thử thực tế GĐ4.5

Đã chạy node tests/stage4-5-regression.cjs trên MySQL local và Microsoft Edge headless ngày 22/09/2026 (UTC), exit code 0. Script dùng nguyên các suite cũ, không sửa điều kiện PASS. Kết quả đầy đủ: [stage4-5-results.json](stage4-5-results.json).

| Phạm vi | Kết quả |
| --- | --- |
| Kiểm tra tổng hợp mới: dữ liệu/schema/bcrypt/secret/scope/seed mô phỏng/bảo toàn dữ liệu | 7/7 PASS |
| GĐ1: /api/health, /api/health/db và kết nối MySQL thật | PASS, trong suite API GĐ2 |
| GĐ2: Auth/JWT/RBAC/User API | 23/23 PASS |
| GĐ2: browser đăng nhập, reload, logout, JWT lỗi/hết hạn | 7/7 PASS |
| GĐ3: Ticket API/workflow/history/quyền/transaction rollback | 30/30 PASS |
| GĐ3: browser Ticket ba role | 5/5 PASS |
| GĐ4.2: Knowledge Base API | 30/30 PASS |
| GĐ4.3: seed thật hai lần | PASS; mỗi lần created=0, skipped=8 |
| GĐ4.3: giữ bài đã chỉnh sửa qua mô phỏng | PASS; không ghi database thật |
| GĐ4.4: 35 test bắt buộc và 4 bổ sung | 39/39 PASS |
| Frontend npm run build | PASS, test 31 của browser KB |
| Backend khởi động phục vụ API và kiểm tra syntax server/app | PASS |

API đã kiểm tra 401 thiếu token, 403 sai quyền, 404 ID không tồn tại, 400 validation/workflow, response không có password/hash/secret/stack/SQL, truy vấn tham số và tạo/đổi trạng thái đồng thời.

Browser kiểm tra đăng nhập thật cả ba role, danh sách/chi tiết/search, create/edit/workflow, nút đúng quyền, reload và logout. Loading, empty, lỗi 401/403/404/500 được mô phỏng response để kiểm tra nhánh giao diện; luồng nghiệp vụ dùng API/MySQL thật. Màn hình 390px không tràn ngang; không có lỗi JavaScript nghiêm trọng.

Báo cáo/ảnh của các giai đoạn trước được khôi phục nguyên bản sau khi thu kết quả mới vào JSON GĐ4.5; không ghi đè lịch sử kiểm thử. Không có test FAIL trong lần chạy tổng này.

## Review bảo mật cơ bản

- Git không track .env thật, node_modules hoặc dist; .env được gitignore. Chỉ .env.example được track.
- Quét các file đang được track không thấy giá trị DB_PASSWORD, JWT_SECRET hoặc SEED_USER_PASSWORD của cấu hình local. Các file mới/thay đổi được kiểm tra lại trước commit, không in giá trị secret.
- JWT_SECRET lấy từ môi trường, kiểm tra tối thiểu 32 ký tự; JWT giới hạn HS256 và xác minh hạn dùng.
- Cả ba mật khẩu demo trong MySQL là bcrypt cost 12, so sánh thành công; không lưu plaintext.
- API quản trị có RBAC backend; Employee không tạo/sửa/đổi trạng thái KB. Role/status được đọc lại từ DB.
- Model KB sử dụng placeholder ? cho giá trị người dùng; điều kiện lọc và tên bảng trong script là chuỗi cố định, không lấy từ input client.
- Frontend không hard-code mật khẩu/secret; mật khẩu nhập ở form chỉ tồn tại tạm trong React state và bị xóa khi đăng nhập thành công/đăng xuất. Không lưu vào sessionStorage/localStorage hoặc log.
- Nội dung KB được React hiển thị dạng text, không chèn HTML từ bài viết. Lỗi backend không trả stack hoặc SQL.
- Đã rà soát log và source ứng dụng; không có implementation Qdrant/Embedding/Vector Search/LLM/OpenAI/Gemini hoặc semantic retrieval.

Đây là review cơ bản phạm vi đồ án, không phải kiểm toán bảo mật production hoặc quét CVE dependency. Không bổ sung framework bảo mật hoặc dependency mới.

## Dữ liệu cuối cùng

| Bảng | Số bản ghi |
| --- | --- |
| users | 3 |
| tickets | 3 |
| ticket_history | 17 |
| knowledge_articles | 8 |

Tám bài KB vẫn PUBLISHED; mã thực tế hiện KB-000008 đến KB-000015. Ba user demo ACTIVE. Đã đối chiếu toàn bộ trường của mọi bản ghi trước/sau (bao gồm nội dung, timestamp và hash trong bộ nhớ), xác nhận nguyên vẹn; không đưa hash hoặc snapshot nhạy cảm vào báo cáo.

Các suite cũ tạo/dọn đúng dữ liệu test của từng lượt. Bộ test Auth tạm đổi trạng thái tài khoản rồi phục hồi ACTIVE và timestamp theo cơ chế hồi quy đã có. Không xóa dữ liệu gốc, không TRUNCATE/DROP/reset AUTO_INCREMENT. Bộ đếm tự tăng có thể tăng khi tạo/xóa bản ghi test, không ảnh hưởng tính duy nhất của mã.

## File GĐ4.5 và thay đổi thực tế

Tạo:

- backend/tests/stage4-5-regression.cjs: bộ tổng hợp nhỏ, kiểm tra ban đầu, gọi suite cũ, giữ báo cáo cũ và đối chiếu dữ liệu.
- docs/stage4-5-results.json: bằng chứng kiểm thử thực tế.
- docs/giai-doan-4-5.md: tổng kết này.

Sửa:

- README.md: trạng thái sau GĐ4, công nghệ/vai trò/chức năng, SQL theo thứ tự, cấu hình/chạy/seed, API, test và giới hạn.
- frontend/src/App.jsx: chỉ sửa dòng mô tả “ứng dụng RAG” thành mô tả tra cứu hướng dẫn CNTT đúng hiện trạng; không đổi logic giao diện.

Không phát hiện lỗi nghiệp vụ cần sửa. Không sửa backend nghiệp vụ, schema, test cũ hoặc thêm chức năng lớn. Dòng mô tả gây hiểu nhầm và README lỗi thời đã được sửa trước khi chạy/hoàn tất kiểm chứng.

## Chạy lại

Trong backend:

```powershell
node tests/stage4-5-regression.cjs
```

Cần cấu hình .env local, MySQL, ba tài khoản demo, Edge và Playwright tại thư mục tạm it-support-browser-check/node_modules/playwright; cổng 5173 trống. Script dành cho bộ demo 3/3/17/8, dừng trước khi ghi nếu dữ liệu ban đầu khác; không tự dọn dữ liệu hợp lệ để ép PASS. Tránh sửa dữ liệu đồng thời trong lúc test.

## Giới hạn và chuẩn bị cho GĐ5

- Search chỉ theo từ khóa code/title; chưa tìm theo ý nghĩa hoặc nội dung.
- Chưa phân trang/cập nhật thời gian thực; cần nút làm mới khi người khác sửa bài.
- Giới hạn JSON request 16 KB; chưa upload, lịch sử phiên bản KB hoặc API xóa bài.
- Quản lý user hiện là API, chưa có UI riêng.
- Reload giữ phiên nhưng về Ticket; đổi tab không lưu form chưa gửi.
- JWT dùng sessionStorage, đăng xuất chưa thu hồi token phía server.
- Bộ test tổng phụ thuộc môi trường demo/Edge/Playwright local; không tự cài thêm dependency.

Dữ liệu bài viết, phân quyền và API hiện có là nền tảng để xác định yêu cầu giai đoạn sau. Chỉ chuẩn bị bằng tài liệu hiện trạng; chưa thiết kế/triển khai schema, API, dependency hoặc dịch vụ GĐ5. Chờ người dùng xác nhận phạm vi trước mọi bước tiếp theo.

Giai đoạn 4 đã hoàn thành.
