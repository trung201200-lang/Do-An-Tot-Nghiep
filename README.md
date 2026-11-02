# Hệ thống hỗ trợ CNTT nội bộ

Hệ thống hỗ trợ xử lý sự cố CNTT nội bộ: quản lý Ticket và tra cứu hướng dẫn trong Kho kiến thức (Knowledge Base).

Đã hoàn thành Giai đoạn 1–4: Authentication/RBAC, Ticket Management và Knowledge Base truyền thống. Frontend tiếp tục tìm kiếm KB theo từ khóa. GĐ5.2–5.4 bổ sung pipeline RAG thử nghiệm ở backend: embedding local, vector retrieval và generation bằng Gemini. GĐ5.5 tích hợp giao diện Trợ lý CNTT để hỏi đáp từng câu độc lập.

## Công nghệ

- Frontend: React, Vite, CSS; quản lý giao diện bằng React state.
- Backend: Node.js, Express 5, mysql2, dotenv, cors.
- Database: MySQL, quản lý bằng MySQL Workbench.
- Authentication: JWT (HS256), bcrypt (cost 12).
- Môi trường ban đầu: Node.js 22.17.1, npm 10.9.2. Không cần XAMPP hoặc Docker.

## Cấu trúc

```text
frontend/src/           Đăng nhập, Ticket, Knowledge Base, API helper
backend/src/config/     Cấu hình môi trường, MySQL, JWT
backend/src/controllers/ Auth, users, Ticket, Knowledge Base, health
backend/src/models/     Truy vấn MySQL sử dụng tham số
backend/src/middleware/  JWT, RBAC, xử lý lỗi
backend/src/routes/      Định tuyến API
backend/src/utils/       Validation, seed users và Knowledge Base
backend/tests/           Kiểm thử API, browser và hồi quy
backend/server.js        Khởi động server
database/               SQL chạy thủ công trong MySQL Workbench
docs/                   Tài liệu, báo cáo và ảnh kiểm thử
```

## Vai trò

| Role | Ticket | Knowledge Base | Users |
| --- | --- | --- | --- |
| EMPLOYEE | Tạo và xem Ticket của mình | Chỉ đọc bài PUBLISHED | Xem thông tin phiên của mình |
| IT | Xem tất cả, tiếp nhận và xử lý Ticket được giao cho mình | Xem tất cả, tạo, sửa, đổi trạng thái | Không quản trị |
| ADMIN | Xem và xử lý tất cả Ticket | Quyền giống IT | Quản lý qua API |

Hiện chưa có giao diện quản trị users riêng. Backend kiểm tra quyền từ database trên mỗi yêu cầu, không chỉ dựa vào nút hiển thị trên frontend.

## Chức năng đã hoàn thành

### Authentication

- Đăng nhập, JWT, RBAC; chặn tài khoản INACTIVE.
- Mật khẩu lưu bằng bcrypt, không lưu plaintext trong database.
- Frontend giữ token trong sessionStorage theo tab, gọi /api/auth/me khi reload; kiểm tra lại khi quay lại tab và định kỳ một phút.
- Đăng xuất xóa token ở trình duyệt; chưa có cơ chế thu hồi token phía server.

### Ticket Management

- Employee tạo yêu cầu; IT/Admin tiếp nhận, priority thủ công LOW/MEDIUM/HIGH.
- Workflow: NEW → RECEIVED → IN_PROGRESS → RESOLVED → CLOSED; cho phép RESOLVED → IN_PROGRESS.
- Bắt buộc solution khi RESOLVED; CLOSED chỉ xem.
- IT khác không được xử lý Ticket đã giao cho người khác. ADMIN có quyền xử lý tất cả.
- Lưu history khi tạo và mọi chuyển trạng thái; transaction và khóa dòng bảo vệ cập nhật Ticket/history.

### Knowledge Base

- Danh sách, chi tiết, tạo/sửa bài, trạng thái và phân quyền.
- Employee chỉ đọc PUBLISHED; IT/Admin quản lý mọi trạng thái.
- Tìm theo code/title, trim khoảng trắng, không phân biệt hoa/thường. Từ khóa rỗng trả toàn bộ danh sách API cho phép xem.
- Tám bài demo tiếng Việt về Wi-Fi, máy in, mật khẩu, email, máy chậm, thư mục mạng, microphone và website nội bộ.
- Loading, thông báo lỗi, danh sách rỗng, giữ xuống dòng nội dung; hỗ trợ bố cục màn hình nhỏ.

## Knowledge Base workflow

```text
DRAFT → PUBLISHED → ARCHIVED → DRAFT
```

Bài mới luôn DRAFT. Backend tự sinh code dạng KB-000001 từ ID thực tế; không yêu cầu mã bắt đầu từ 1 và có thể nhảy số. PUT chỉ sửa title/content; PATCH status chỉ cho phép chuyển theo workflow trên. Không có API xóa bài.

Keyword Search khác Semantic Search và RAG. Search hiện tại chỉ lọc chuỗi code/title trên danh sách frontend đã lấy từ API; không tìm theo ý nghĩa, không truy xuất vector và không sinh câu trả lời.

## Thiết lập database bằng MySQL Workbench

Với môi trường mới, kết nối MySQL local và chạy các file theo thứ tự:

1. database/01_create_database.sql
2. database/02_create_users.sql
3. database/03_create_tickets.sql
4. database/04_create_knowledge_base.sql

Database it_support_rag có bốn bảng: users, tickets, ticket_history, knowledge_articles. Các file dùng CREATE IF NOT EXISTS, không xóa dữ liệu. Bảng đã tồn tại sẽ không được tự điều chỉnh cấu trúc; cần kiểm tra nếu schema cũ khác. Môi trường hiện tại đã có đủ bốn bảng, không cần chạy lại SQL.

## Cấu hình local

Giữ cấu hình MySQL đang hoạt động trong backend/.env. Khi thiết lập mới, sao chép backend/.env.example thành backend/.env rồi điền cấu hình MySQL, JWT_SECRET ngẫu nhiên dài ít nhất 32 ký tự và SEED_USER_PASSWORD. Không đưa file .env hoặc secret thật vào Git.

SEED_USER_PASSWORD chỉ dùng tạo tài khoản local/demo lần đầu, ít nhất 8 ký tự và tối đa 72 byte UTF-8. Seed bỏ qua tài khoản có sẵn, không đổi mật khẩu hoặc quyền. Khởi động lại backend sau khi sửa cấu hình môi trường. Frontend mặc định gọi http://127.0.0.1:5000/api; có thể cấu hình VITE_API_URL theo API helper hiện tại.

## Cài đặt và chạy

Terminal thứ nhất, từ thư mục gốc; chỉ seed sau khi đã tạo bảng và cấu hình .env:

```powershell
cd backend
npm.cmd install
npm.cmd run seed:users
npm.cmd run seed:knowledge
npm.cmd run dev
```

Có thể dùng npm.cmd start để chạy backend không có nodemon.

Terminal thứ hai, từ thư mục gốc:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Trên PowerShell, npm.cmd tương đương npm và tránh lỗi ExecutionPolicy của npm.ps1. Các lệnh tương ứng là npm install, npm run dev, npm run seed:knowledge và npm run build.

- Frontend: http://127.0.0.1:5173
- Backend: http://127.0.0.1:5000
- Health: http://127.0.0.1:5000/api/health
- MySQL health: http://127.0.0.1:5000/api/health/db

Trong frontend, dùng npm.cmd run build để build và npm.cmd run preview để xem bản build. Dùng Ctrl+C dừng server. Origin frontend mặc định được backend cho phép là http://127.0.0.1:5173.

## Tài khoản demo

| Email | Role |
| --- | --- |
| employee@test.local | EMPLOYEE |
| it@test.local | IT |
| admin@test.local | ADMIN |

Chỉ dùng local/demo. Mật khẩu là SEED_USER_PASSWORD tại thời điểm tạo tài khoản; không công bố mật khẩu thật trong tài liệu. Ba tài khoản demo hiện ACTIVE.

Sau đăng nhập, hệ thống mở trang Tổng quan. Dùng menu bên để truy cập Yêu cầu hỗ trợ, Kho kiến thức hoặc Trợ lý AI; Quản lý người dùng chỉ dành cho ADMIN. Tải lại trang giữ phiên đăng nhập và trở về Tổng quan. Frontend không lưu mật khẩu vào sessionStorage/localStorage.

## Seed Knowledge Base

Chạy npm.cmd run seed:knowledge trong backend. Script yêu cầu MySQL local, bảng knowledge_articles và tài khoản it@test.local có role IT, status ACTIVE; từ chối production.

Mỗi bài mới được tạo rồi xuất bản bằng model hiện có. Seed nhận diện bài qua tiêu đề gốc hoặc marker [DEMO-KB:...] trong nội dung. Bài đã tồn tại được bỏ qua hoàn toàn: không đổi code, nội dung, trạng thái hoặc timestamp. Chạy lại trên bộ demo hiện tại tạo 0, bỏ qua 8.

Nếu mất cả tiêu đề gốc và marker hoặc nhận diện bị trùng, script dừng để kiểm tra thủ công. Seed không tự xuất bản lại bài đã tồn tại ở DRAFT/ARCHIVED. Không xóa dữ liệu để seed lại. Nội dung seed là dữ liệu đồ án, không phải quy trình chính thức của doanh nghiệp.

## API

Các API nghiệp vụ yêu cầu `Authorization: Bearer <token>`.

| Method | API | Quyền / chức năng |
| --- | --- | --- |
| GET | /api/health, /api/health/db | Công khai |
| POST | /api/auth/login | Công khai, nhận email/password |
| GET | /api/auth/me | User ACTIVE có JWT hợp lệ |
| GET | /api/test/employee | EMPLOYEE, IT, ADMIN |
| GET | /api/test/it | IT, ADMIN |
| GET | /api/test/admin | ADMIN |
| GET, POST | /api/users | ADMIN: danh sách/tạo user |
| PATCH | /api/users/:id/status, /api/users/:id/role | ADMIN |
| POST | /api/tickets | EMPLOYEE tạo Ticket |
| GET | /api/tickets, /api/tickets/:id | Danh sách/chi tiết và history theo quyền |
| PATCH | /api/tickets/:id/accept | IT/ADMIN tiếp nhận |
| PATCH | /api/tickets/:id/priority | IT/ADMIN, kiểm tra người được giao |
| PATCH | /api/tickets/:id/status | IT/ADMIN, kiểm tra workflow và người được giao |
| GET | /api/knowledge, /api/knowledge/:id | Employee chỉ PUBLISHED; IT/Admin mọi trạng thái |
| POST | /api/knowledge | IT/ADMIN; title, content |
| PUT | /api/knowledge/:id | IT/ADMIN; title, content |
| PATCH | /api/knowledge/:id/status | IT/ADMIN; status |
| POST | /api/rag/ask | EMPLOYEE/IT/ADMIN ACTIVE; question → answer/sources hoặc fallback |

Response dùng success, message khi phù hợp và dữ liệu; KB trả articles cho danh sách hoặc article cho một bài. Không trả password/hash. HTTP 400: validation/workflow; 401: phiên không hợp lệ; 403: sai quyền; 404: không tồn tại; 409: trùng mã/email; 413: vượt giới hạn JSON 16 KB; 500/503: lỗi xử lý/database, thông báo an toàn.

## Kiểm thử và tài liệu

Trong backend, chạy bộ tổng hợp GĐ4.5:

```powershell
node tests/stage4-5-regression.cjs
```

Script tái sử dụng bộ API/browser hiện có, chạy build frontend và seed hai lần, giữ báo cáo các giai đoạn cũ. Kết quả mới lưu tại docs/stage4-5-results.json. Cần MySQL local, ba tài khoản demo khớp cấu hình, Microsoft Edge, Playwright đã có tại thư mục tạm it-support-browser-check/node_modules/playwright và cổng 5173 trống. Playwright không được thêm vào dependency ứng dụng.

Bộ tổng hợp dành cho bộ dữ liệu demo 3 users / 3 tickets / 17 history / 8 bài KB; dừng nếu dữ liệu ban đầu khác. Không chạy đồng thời với người khác sửa dữ liệu. Test tạo và dọn đúng bản ghi tạm, đối chiếu toàn bộ dữ liệu gốc trước/sau; không reset AUTO_INCREMENT. Kiểm thử seed giữ nội dung đã sửa dùng mô phỏng, không biên tập tám bài thật.

Kết quả GĐ4.5: Auth API 23/23, Ticket API 30/30, KB API 30/30, browser đăng nhập 7/7, browser Ticket 5/5, browser KB 39/39 PASS; health, DB health, build và hai lần seed PASS. Dữ liệu cuối: 3 users, 3 tickets, 17 history, 8 bài KB PUBLISHED.

- [GĐ2: Auth và RBAC](docs/giai-doan-2.md)
- [GĐ3: Ticket](docs/giai-doan-3.md)
- [GĐ4.2: KB API](docs/giai-doan-4-2.md)
- [GĐ4.3: Seed](docs/giai-doan-4-3.md)
- [GĐ4.4: Frontend KB](docs/giai-doan-4-4.md)
- [GĐ4.5: Tổng kết và kiểm thử](docs/giai-doan-4-5.md)

Tài liệu từng giai đoạn mô tả trạng thái tại thời điểm đó; README mô tả trạng thái hiện tại.

## Trạng thái dự án và giới hạn

Đã hoàn thành Authentication/RBAC, Ticket Management và Knowledge Base. Giai đoạn 4 đã hoàn thành.

Đã có thử nghiệm Chunking, Embedding, Vector Retrieval và RAG Generation tại backend. Đã có giao diện Trợ lý CNTT; chưa có chat memory, Qdrant hoặc triển khai production.

Hiện chưa phân trang, cập nhật thời gian thực, upload hoặc lịch sử phiên bản KB. Search không bỏ dấu tiếng Việt; chuyển tab không lưu form chưa gửi. Review bảo mật ở phạm vi đồ án/local, chưa phải đánh giá bảo mật triển khai production.

GĐ6.4 đã hoàn thành kiểm chứng bản demo cuối. Xem [báo cáo](docs/giai-doan-6-4.md), [kịch bản demo 7–10 phút](docs/giai-doan-6-4-demo-script.md) và [kết quả](docs/stage6-4-results.json). Phạm vi RAG kiểm chứng mới dùng E5 thật/Gemini mock, 0 request Gemini thật; hai P2 vẫn MITIGATED. Dừng sau GĐ6.4.

## GĐ5.4: RAG Generation với Gemini

Dependency mới: @google/genai 2.24.0. Trong backend, chạy npm ci khi cài lại dependency. Chỉ cấu hình GEMINI_API_KEY trong backend/.env local (đã ignore); đặt GEMINI_MODEL=gemini-3.5-flash-lite theo model đã được phê duyệt. Không in key, đưa key vào frontend hoặc commit .env. .env.example chỉ chứa tên biến và giá trị mẫu không bí mật.

POST /api/rag/ask yêu cầu JWT hiện tại của EMPLOYEE/IT/ADMIN ACTIVE, body gồm question (chuỗi 1–1000 ký tự). Response gồm answered, answer, sources; fallback có answered=false và sources=[]. Ví dụ body: {"question":"Không kết nối được Wi-Fi thì làm gì?"}. Lỗi provider/đầu ra trả HTTP 502/503/504 có code và message an toàn; không được coi là câu trả lời thành công.

Chạy trong thư mục backend:

~~~powershell
npm run test:stage5-4:logic
node tests/stage5-4-api.cjs
npm run test:stage5-4
~~~

Hai lệnh đầu dùng Gemini mock; API test đăng nhập MySQL thật. Lệnh cuối gọi Gemini thật cho các câu vượt threshold, ghi kết quả 24 câu và chạy regression GĐ5.2/5.3, Auth, Ticket, KB. Cần MySQL local, cấu hình demo đang hoạt động, model embedding local/cached và key/model hợp lệ; không chạy đồng thời với người sửa dữ liệu. Lượt thực nghiệm đã lưu gọi Gemini 18 lần; chạy lại có thể phát sinh quota/chi phí và kết quả khác. Runner giữ lượt trước trong previousAttempts và đặt đánh giá thủ công lượt mới về PENDING, cần rà soát lại từng câu. Exit code 0/completed=true chỉ xác nhận chạy đủ, không bảo đảm chất lượng mọi câu.

Kết quả hiện tại: 14 answer, 8 fallback, 2 lỗi kiểm tra evidence; groundedness thủ công 13 PASS/1 PARTIAL trên 14 answer. Xem [báo cáo GĐ5.4](docs/giai-doan-5-4.md) và [kết quả đầy đủ](docs/stage5-4-results.json), gồm các trường hợp chưa đạt. Không chạy seed hoặc thay threshold để làm đẹp kết quả.

## GĐ5.5: Giao diện Trợ lý CNTT

Đăng nhập bằng EMPLOYEE, IT hoặc ADMIN, chọn **Trợ lý CNTT**, nhập câu hỏi rồi bấm **Gửi câu hỏi** hoặc Enter (Shift+Enter xuống dòng). Giao diện gọi POST /api/rag/ask bằng JWT hiện tại; Gemini chạy ở backend, frontend không chứa API key. Answer được hiển thị dưới dạng text cùng mã/tiêu đề nguồn; fallback và lỗi provider/evidence có thông báo riêng. API hiện không trả nguyên nhân chi tiết cho từng dạng fallback.

Khi fallback, EMPLOYEE có nút **Tạo yêu cầu hỗ trợ** để chuyển sang mục Ticket; người dùng chọn **Tạo yêu cầu** và tự gửi form. Không tự động tạo Ticket. Chỉ giữ kết quả hiện tại trong state; chuyển tab hoặc đăng xuất sẽ xóa.

GĐ5.5 đã kiểm thử 34 browser tests, regression 83 API nghiệp vụ + 51 browser cũ + 23 RAG logic/API, build và giữ dữ liệu gốc PASS; dùng đúng một request Gemini thật. Xem [báo cáo GĐ5.5](docs/giai-doan-5-5.md) và [kết quả kiểm thử](docs/stage5-5-results.json). Trong backend, node tests/stage5-5-regression.cjs chạy bộ tổng hợp; cần MySQL local, tài khoản demo, Edge và Playwright tại thư mục tạm như các bộ browser trước. Lệnh có gọi Gemini thật; không chạy lại nếu chỉ muốn xem kết quả đã lưu. Các hạn chế chất lượng GĐ5.4 vẫn được giữ nguyên trong báo cáo.

## Tổng kết phần RAG – GĐ5.6

Pipeline hiện tại: Knowledge Base PUBLISHED → Chunking → Embedding local bằng Xenova/multilingual-e5-small (384 chiều) → vector trong RAM → Retrieval cosine → context → Gemini gemini-3.5-flash-lite → answer/sources hoặc fallback → React Trợ lý CNTT. Câu hỏi đi qua JWT, validation và query embedding; Gemini chỉ chạy ở backend. EMPLOYEE gửi yêu cầu hỗ trợ bằng cách tạo Ticket, IT tiếp nhận/xử lý; RAG không tự tạo Ticket.

Xem [tổng kết và đánh giá RAG](docs/giai-doan-5-6.md), [kết quả kiểm chứng cuối](docs/stage5-6-results.json) và [checklist 14 hình minh chứng](docs/giai-doan-5-minh-chung.md). GĐ5.6 giữ nguyên code nghiệp vụ/số liệu thực nghiệm cũ và không gọi Gemini thật. Các chỉ số Retrieval, Generation, groundedness, nguồn, latency và UX được phân biệt; những trường hợp chưa đạt vẫn được ghi nhận. Phần RAG hoàn thiện trong phạm vi nghiên cứu/thực nghiệm đồ án, chưa triển khai production.

## Kiểm thử hoàn thiện GĐ6.3

Từ `backend`, `npm run test:stage6-3` chạy logic/replay/mock trong bộ nhớ:
không cần `.env`, MySQL, browser, model cache hoặc Gemini thật. Hai thư mục
backend/frontend có package-lock; cài dependency bằng `npm ci` trong từng thư mục.

`npm run test:stage6-3:integration` chạy API/MySQL, browser Unicode, E2E và regression.
Chỉ dùng database local demo `it_support_rag`, ban đầu 3 users/3 tickets/17 history/8 KB
PUBLISHED, ba demo role ACTIVE; không chạy cùng phiên sửa dữ liệu khác.
Cần cấu hình backend local theo `.env.example`, mật khẩu demo runtime, JWT và MySQL;
không ghi secret vào báo cáo. Không cần Gemini key thật: provider được mock, 0 request thật.
Model E5/cache hiện có cần cho retrieval thật; không xóa cache. Lần tải model đầu cần mạng.

Browser dùng Microsoft Edge và Playwright 1.63.0 hiện có tại
`%TEMP%/it-support-browser-check/node_modules/playwright` (cùng prerequisite các suite cũ).
Nếu thiếu, cài đúng phiên bản vào thư mục test riêng bằng
`npm install --prefix "$env:TEMP/it-support-browser-check" --no-save playwright@1.63.0`
trong PowerShell. Cổng 5173 phải trống; runner tự mở/đóng backend/frontend test.
Không chạy các suite API cũ riêng trên dữ liệu cần bảo toàn; runner tổng dọn fixture
và đối chiếu toàn bộ bản ghi, giữ báo cáo lịch sử nguyên byte.

**NOT VERIFIED ON CLEAN MACHINE.** Các lệnh npm ci ở trên là hướng dẫn chuẩn bị,
không phải tuyên bố đã kiểm chứng cài mới/CI. Kết quả GĐ6.3 tách khỏi lịch sử GĐ5/6.2;
mock/replay không chứng minh chất lượng Gemini live. Chi tiết: [GĐ6.3](docs/giai-doan-6-3.md).

GĐ6.4 dùng lại bộ integration trên, bổ sung `node tests/stage6-4-ui.cjs` trong
backend để kiểm form/detail/editor tại 1280px và 390px, không ghi dữ liệu form.
Chạy tuần tự, không cùng phiên demo. E5 ở môi trường kiểm chứng vẫn cần mạng;
sandbox chặn fetch có thể làm child test dừng trước cleanup. Khi runner lỗi,
kiểm fixture và fingerprint theo báo cáo GĐ6.4 trước khi chạy lại, không reset DB.

## GĐ7.1: lựa chọn generation provider

Backend đọc `RAG_PROVIDER` khi tạo RAG service. Bỏ biến này dùng `gemini` mặc định;
`RAG_PROVIDER=gemini` giữ model, prompt, evidence validator và response hiện tại.
Giá trị rỗng/không hợp lệ trả `GENERATION_PROVIDER_CONFIGURATION` (503).
GĐ7.2 bổ sung adapter hoạt động cho `RAG_PROVIDER=ollama` (hướng dẫn bên dưới),
không tự chuyển sang Gemini. Khởi động lại backend khi đổi provider.

Factory ở `backend/src/rag/generationProvider.js`; Gemini client chỉ khởi tạo khi
thực sự cần generation. Fallback retrieval với Gemini mặc định không cần key.
Provider/cấu hình Ollama không hợp lệ bị từ chối ngay khi tạo service, trước retrieval.
API vẫn chỉ nhận `{ question }`, không nhận provider/model/URL từ frontend.

API JavaScript nội bộ hỗ trợ `createRagService(pool, { provider, loadEmbedding })`.
Provider có `{ name, model, generate(prompt) }`, trả `{ text, usage }`; `loadEmbedding`
dành cho test dùng embedder trong bộ nhớ. Khi không inject, dùng E5 và factory thật.
Prompt vẫn có `systemInstruction/contents` như Gemini; adapter Ollama chuyển thành
messages system/user, giữ nội dung instruction/schema và validator chung.

Trace nội bộ thêm `provider`, `model`, `providerCalled`; giữ `geminiCalled` cho runner
cũ, chỉ true khi gọi generate của provider mang tên Gemini. Các cờ là đánh dấu gọi
adapter, không chứng minh request mạng thành công. Response công khai vẫn chỉ
`answered/answer/sources`; route không trả trace. Provider injection là cấu hình tin cậy
trong code backend, không phải dữ liệu người dùng. Lỗi provider được truyền lên,
không thử provider khác. Mã lỗi validator vẫn giữ `GEMINI_*` để tương thích ở GĐ7.1.

Test an toàn từ thư mục backend: `npm run test:stage7-1`. Runner dùng mock SDK,
pool/embedder trong bộ nhớ; chặn mạng, đọc `.env`, driver MySQL và model loader;
không ghi báo cáo lịch sử. Gồm 11 nhóm test provider/service và 58 test logic hồi quy.
Không chạy integration/API/browser thật trong giai đoạn này: các runner đó cần
MySQL, có thể tạo/dọn fixture, ghi artifact hoặc gọi model/API.

## GĐ7.2: Ollama Local

`ollamaClient.js` dùng fetch có sẵn của Node, `POST /api/chat`, `stream: false`,
`format: RESPONSE_SCHEMA`, giới hạn output `num_predict` bằng cấu hình generation
hiện tại. Không thêm dependency. Chuyển prompt tại adapter, không đổi prompt Gemini.
Kết quả `message.content` được kiểm JSON/schema rồi trả `{ text, usage }`;
`prompt_eval_count/eval_count` thành input/output tokens, thiếu số liệu trả null.
Validator chung tiếp tục kiểm toàn evidence và nguồn PUBLISHED trước/sau generation.
Mã lỗi validator của nhánh Ollama đổi thành `OLLAMA_INVALID_OUTPUT/EVIDENCE`;
Gemini giữ nguyên mã lỗi/response. Không log body hoặc raw lỗi provider.

Cấu hình riêng trong `backend/.env` local (người dùng tự điền, không commit):

```dotenv
RAG_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=TEN_MODEL_LOCAL_DA_TAI
OLLAMA_TIMEOUT_MS=30000
```

`OLLAMA_MODEL` bắt buộc khi chọn Ollama, không có model mặc định và không tự tải.
Tên trên là placeholder, phải thay bằng tag thật trong `ollama ls`.
URL chỉ chấp nhận HTTP loopback 127.0.0.1/localhost/[::1], có thể đổi port;
không path/query/credential và không theo redirect. Tag chứa `cloud` bị chặn;
người vận hành vẫn phải bảo đảm model/daemon thực sự chạy local, không dùng alias
trỏ cloud hoặc proxy. Frontend không được chọn provider/model/URL.
Timeout 1–300000 ms, mặc định 30000; timer áp dụng cả fetch và đọc response body.

Lỗi phân biệt: `OLLAMA_UNAVAILABLE` (503, không kết nối),
`OLLAMA_MODEL_UNAVAILABLE` (503, HTTP 404: model hoặc endpoint không tồn tại),
`OLLAMA_TIMEOUT` (504), `OLLAMA_HTTP_ERROR` (502),
`OLLAMA_INVALID_RESPONSE`, `OLLAMA_EMPTY`, `OLLAMA_INCOMPLETE`,
`OLLAMA_INVALID_OUTPUT`, `OLLAMA_INVALID_EVIDENCE` (502).
Thông báo cố định, không trả nội dung lỗi upstream. Không retry/chuyển Gemini.

### Cài và tải model thủ công — chưa thực hiện trong GĐ7.2

1. Cài Ollama theo [hướng dẫn Windows chính thức](https://docs.ollama.com/windows)
   và mở ứng dụng. API local mặc định ở port 11434.
2. Chọn model local phù hợp RAM/GPU và hỗ trợ structured output. Không có khẳng định
   về tốc độ/chất lượng model cụ thể ở giai đoạn này. Tự chạy các lệnh dưới đây sau
   khi thay placeholder bằng tên/tag model mong muốn:

```powershell
ollama pull <model:tag>
ollama ls
# Chỉ khi chưa có ứng dụng/daemon đang phục vụ:
ollama serve
```

3. Đặt `OLLAMA_MODEL` trùng tag vừa tải, cấu hình backend như trên rồi khởi động lại
   backend. Muốn dùng lại Gemini, đặt `RAG_PROVIDER=gemini` và restart; không tự đổi.

Nguồn giao thức: [Chat API](https://docs.ollama.com/api/chat),
[structured outputs](https://docs.ollama.com/capabilities/structured-outputs),
[CLI](https://docs.ollama.com/cli). Chỉ dùng mô hình local, không cần Ollama API key.

### Kiểm chứng và giới hạn

Trong backend: `npm run test:stage7-2`. Gồm 18 nhóm mock HTTP Ollama, 11 nhóm
provider/service và 58 test logic hồi quy; không mạng thật/MySQL/model download,
không ghi báo cáo lịch sử. Test GĐ7.1 đã cập nhật ca Ollama từ placeholder sang
lựa chọn adapter lazy; không còn kỳ vọng lỗi NOT_IMPLEMENTED.

Chưa kiểm daemon/model Ollama thật, tốc độ/phần cứng, chất lượng tiếng Việt,
hoặc toàn bộ browser/E2E. Giao diện vẫn abort request sau 65 giây; tăng timeout
backend trên mức này không làm UI đợi lâu hơn. Cold start E5 và nạp model local
có thể gây timeout; browser abort không bảo đảm model đã ngừng tính toán.
Ngân sách context hiện tại là ký tự, không phải tokenizer Ollama; cần kiểm context
window của model thực tế trước benchmark, chưa chứng minh không truncation.
E5 vẫn có thể cần mạng lúc nạp: tích hợp Ollama không đồng nghĩa toàn bộ RAG đã offline.
Evidence khớp nguồn không bảo đảm mọi khẳng định trong answer đúng ngữ nghĩa.

### Chẩn đoán lỗi RAG trong development

Mặc định không ghi log chẩn đoán. Để bật, đặt cả hai biến trong `backend/.env`
(hoặc môi trường chạy backend), rồi tự khởi động lại backend trong terminal:

```dotenv
NODE_ENV=development
RAG_DIAGNOSTICS=true
```

Request lỗi sẽ ghi một dòng `[rag-diagnostic]` ra stderr của backend. Response API
giữ nguyên, không thêm debug. Log chỉ chứa `stage`, `error.name`, `error.code`,
`cause.code`, `provider`, `providerCalled`. Tên/mã lỗi dùng danh sách cho phép cố định;
giá trị lạ thành `UNKNOWN`, giá trị thiếu thành `null`. Không ghi message, stack,
câu hỏi, KB, prompt, output model, SQL, credential hoặc cấu hình môi trường.
`provider` là adapter đã chọn (`null` nếu chưa chọn, `unknown` nếu adapter inject
không thuộc Gemini/Ollama); `providerCalled=true` nghĩa là đã bắt đầu gọi adapter,
không khẳng định HTTP request đã tới model. Trạng thái được tách theo request.

Các stage phân biệt nạp E5 (`embedding_import`, `embedding_tokenizer`,
`embedding_model`; `embedding_load` khi chờ loader), đọc KB (`kb_read`), dựng index
(`corpus_*`), `retrieval`, `provider_generate`, `output_validation` và kiểm tra nguồn
(`source_verify_before`, `source_verify_after`). Stage cho biết bước đang thực hiện
khi lỗi, không tự xác nhận nguyên nhân gốc. Mã chưa nằm trong allowlist cần được
kiểm tra riêng; không bật log raw error để tìm thêm thông tin.

Tắt bằng `RAG_DIAGNOSTICS=false` rồi khởi động lại backend. `NODE_ENV=production`
luôn tắt log này dù flag bằng `true`. Biến môi trường có sẵn được ưu tiên hơn `.env`.
Đổi `.env` không tự cập nhật tiến trình đang chạy. Không cần thay cấu hình provider.

Test an toàn: trong `backend`, chạy `npm run test:rag-diagnostics` và
`npm run test:stage7-2`. Suite chẩn đoán dùng handler/service thật với dependency
mock, không mở server, không đọc `.env` thật, không gọi database/model/network
và không ghi báo cáo thực nghiệm. Không dùng suite integration để kiểm tra thay đổi này.

### GĐ7.2.2: hướng dẫn và schema riêng cho Ollama

Ollama dùng prompt riêng, schema giới hạn answer/evidence và `temperature=0`,
`seed=42`. Gemini giữ nguyên prompt/schema. Không tự sửa `answered=false` thành
true; mọi câu trả lời true vẫn phải qua validator evidence chung. Retrieval,
threshold, E5, KB và response API không đổi. Cần restart backend để nạp code mới.

Unit an toàn: `npm run test:stage7-2-2` trong backend. Xem [báo cáo GĐ7.2.2](docs/giai-doan-7-2-2.md)
về 30 lượt Ollama local, các thử nghiệm thất bại, kết quả cuối và hướng dẫn runner
live có opt-in. Evidence khớp không chứng minh mọi khẳng định của answer có căn cứ;
model nhỏ vẫn có thể trả sai trích dẫn hoặc fallback. Chưa kiểm chứng ngữ nghĩa
từng khẳng định hay chất lượng tổng quát trên tập dữ liệu lớn.
