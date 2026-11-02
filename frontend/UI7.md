# UI 7 — Kiểm tra tổng thể sau UI 1–UI 6

Thực hiện trên `feature/local-rag`. Chỉ sửa frontend và test/tài liệu liên quan; không sửa backend, database, API contract, nội dung KB hoặc tầng RAG. Không đọc credential, không đăng nhập thật, không gọi Gemini/Ollama, không commit/push.

## Kết quả và phạm vi bằng chứng

| Hạng mục | Kết quả | Loại kiểm chứng |
| --- | --- | --- |
| Build Vite | PASS, 49 modules | Build mã nguồn hiện tại |
| UI 1: AppShell/Login/navigation/session | PASS 22/22 | Edge headless, API mock |
| UI 2: Ticket | PASS 17/17 | Edge headless, API mock |
| UI 3: Knowledge Base | PASS 23/23 | Edge headless, API mock |
| UI 4: AI RAG | PASS 17/17 | Edge headless, API mock; không chạy model |
| UI 5: Dashboard | PASS 17/17 | Edge headless, API mock |
| UI 6: Users | PASS 20/20 | Edge headless, API mock |
| UI 7: hồi quy bổ sung | PASS 6/6 | Edge headless, API mock; chỉ GET trong fixture bổ sung |
| `git diff --check` | PASS | Không có lỗi whitespace trong diff tracked |
| Frontend / API / MySQL health | PASS | HTTP thật, chỉ đọc; chi tiết bên dưới |

Tổng cộng **122/122 nhóm kiểm tra** (116 nhóm cũ + 6 nhóm UI 7), không phải 122 giao dịch database thật. Test có các bước con và dùng dữ liệu giả lập trong bộ nhớ. Runner chặn mọi API của trang; request ngoài fixture bị coi là lỗi. Kiểm tra mutations của UI 2/3/6 chỉ sửa dữ liệu mock.

Đã kiểm tra loading/error/empty/no-results, validation, chống gửi trùng, xác nhận KB/users, Tab/Shift+Tab/Enter/Escape, focus khi mở/đóng/điều hướng, 401 và logout, 403/409, ba vai trò, desktop 1440px và mobile 390/320px. Đã xem ảnh Dashboard desktop, RAG mobile, xác nhận KB mobile, Users 320px. Tiếng Việt hiển thị đúng trên các ảnh được xem. Đây không phải chứng nhận WCAG hay kiểm thử đầy đủ bằng trình đọc màn hình.

## Lỗi đã tái hiện và sửa

### 1. Chi tiết Ticket đến chậm xuất hiện lại sau khi hạ quyền

- Trước sửa: đăng nhập ADMIN, bắt đầu GET chi tiết Ticket của người khác, đổi `/auth/me` sang EMPLOYEE rồi trả response chi tiết cũ. Test FAIL: `.ticket-detail` vẫn xuất hiện.
- Nguyên nhân: App dùng `key={user.id}` cho Tickets; callback GET chi tiết cũ còn cập nhật được cùng instance sau thay đổi vai trò. Effect tải list theo role không vô hiệu hóa callback chi tiết đó.
- Sửa `App.jsx`: key Ticket gồm cả ID và role, giống các màn hình khác. Đổi role tạo instance mới; response cũ không cập nhật màn hình mới.
- Sau sửa: danh sách EMPLOYEE được tải lại, detail cũ không xuất hiện, không có hành động xử lý Ticket. Backend vẫn quyết định quyền truy cập thực tế.

### 2. Chi tiết Ticket cũ còn hiển thị sau 403/404

- Trước sửa: mở chi tiết thành công rồi làm mới trả 403. Test FAIL vì chi tiết và vùng xử lý cũ vẫn hiển thị.
- Sửa `Tickets.handleError()`: khi nhận 403/404, bỏ selected detail và trạng thái refresh, giữ thông báo lỗi, trả focus về tiêu đề. Không biến lỗi thành thành công.
- Sau sửa: test kiểm tra cả 403 và 404 đều PASS, không còn detail/vùng xử lý cũ. Không thay đổi quyền hoặc workflow Ticket.

### 3. Danh sách Ticket/KB sai cấu trúc làm hỏng màn hình

- Trước sửa: HTTP 200 với `{}` được đưa thẳng vào state bằng `data.tickets` / `data.articles`; component gọi `.filter()` trên `undefined`. Hai test FAIL vì không có trạng thái lỗi phục hồi để người dùng thử lại.
- Sửa `responseData.js`: kiểm tra danh sách, ID, mã, tiêu đề, enum liên quan và ID trùng trước khi ghi state; dữ liệu sai trở thành thông báo lỗi an toàn, không thay bằng `[]`.
- `Tickets.jsx` và `KnowledgeBase.jsx` dùng bộ đọc này; KB cũng kiểm tra list khi tải lại sau ghi. Nội dung KB và payload không đổi.
- Sau sửa: thiếu list, list null và phần tử null đều hiện lỗi, app còn hoạt động, Thử lại tải được dữ liệu hợp lệ.

Tái hiện trước sửa được thực hiện trên build cũ với test mới; chạy lại cùng test sau sửa PASS. Những lỗi trên là lỗi frontend đã tái hiện bằng API mock, không phải khẳng định backend hiện đang trả dữ liệu lỗi.

## Đối chiếu API với mã backend

Nguồn đọc: `backend/src/app.js`, các routes/controllers auth, ticket, knowledgeArticle, user, rag; `ticketModel.js`, `knowledgeArticleModel.js`, quy tắc `userModel.updateAccess()`, middleware auth/role/error. Không chạy các model hoặc controller trực tiếp.

Tất cả đường dẫn bên dưới có tiền tố `/api`:

| Luồng | Endpoint/method | Payload frontend | Response đọc / quyền |
| --- | --- | --- | --- |
| Đăng nhập | POST `/auth/login` | `{email,password}` | `token,user`; backend 400/401 nếu không hợp lệ |
| Kiểm tra phiên | GET `/auth/me` | Không body | `user`; backend đọc role/status hiện tại, 401 nếu phiên không hợp lệ/tài khoản INACTIVE |
| Danh sách Ticket | GET `/tickets` | Không body | `tickets`; EMPLOYEE chỉ Ticket của mình, IT/ADMIN theo quyền backend |
| Chi tiết Ticket | GET `/tickets/:id` | Không body | `ticket` và `history`; 403 nếu EMPLOYEE đọc Ticket người khác, 404 nếu không có |
| Tạo Ticket | POST `/tickets` | `{title,description}` | `ticket`, HTTP 201; chỉ EMPLOYEE |
| Tiếp nhận | PATCH `/tickets/:id/accept` | `{}` | `ticket`; IT/ADMIN, chỉ NEW, backend tự gán người đăng nhập |
| Ưu tiên | PATCH `/tickets/:id/priority` | `{priority}` | LOW/MEDIUM/HIGH; theo người phụ trách và quyền ADMIN, CLOSED chỉ đọc |
| Trạng thái Ticket | PATCH `/tickets/:id/status` | `{status}`, thêm `solution` chỉ khi RESOLVED | RECEIVED → IN_PROGRESS → RESOLVED → CLOSED; RESOLVED có thể về IN_PROGRESS; 403/409 theo quyền/trạng thái |
| Danh sách/chi tiết KB | GET `/knowledge`, `/knowledge/:id` | Không body | `articles` / `article`; EMPLOYEE chỉ PUBLISHED, detail có 403/404 |
| Tạo/sửa KB | POST `/knowledge`, PUT `/knowledge/:id` | `{title,content}` | `article`; IT/ADMIN; tạo DRAFT |
| Trạng thái KB | PATCH `/knowledge/:id/status` | `{status}` | DRAFT → PUBLISHED → ARCHIVED → DRAFT; sai chuyển trạng thái trả **400**, không phải 409 |
| Danh sách users | GET `/users` | Không body | `users`; ADMIN |
| Tạo user | POST `/users` | `{name,email,password,role,status}` | `user`, HTTP 201; ADMIN; email trùng 409 |
| Quyền/trạng thái user | PATCH `/users/:id/role`, `/users/:id/status` | `{role}` hoặc `{status}` | `user`; ADMIN; chặn mất ACTIVE ADMIN cuối cùng bằng 409 |
| RAG | POST `/rag/ask` | **Chỉ `{question}`** | `answered,answer,sources`; các mã lỗi có cấu trúc từ backend |

Các response nghiệp vụ thông thường có `success` và tùy endpoint có `message`. Frontend không đòi thêm trường ngoài contract. Ticket dùng đúng các giới hạn UTF-16 hiện có; KB tiêu đề tính Unicode code point và kiểm tra payload JSON 16 KB theo Express; tạo user giữ password không trim và giới hạn UTF-8 72 byte. Không thêm API xóa, giao Ticket tùy ý hay reset mật khẩu.

Self-change users: backend cho phép tự hạ quyền/tự vô hiệu hóa nếu còn ACTIVE ADMIN khác. `LAST_ACTIVE_ADMIN` chỉ là code nội bộ, không có trong response công khai; frontend xử lý HTTP 409. 401 đăng xuất; 403 users ẩn nội dung quản trị và kiểm tra lại phiên. Test UI 6 có phản hồi auth cũ đến chậm và trường hợp dữ liệu đổi giữa lúc xác nhận/PATCH.

## Dashboard và RAG

- Dashboard kiểm tra cấu trúc trước khi tính số liệu. NEW, RECEIVED, IN_PROGRESS, RESOLVED, CLOSED đếm riêng; không gộp CLOSED vào RESOLVED. EMPLOYEE lọc owner; IT đếm NEW và Ticket do mình phụ trách đúng nhãn; ADMIN có nguồn users riêng.
- Lỗi mỗi nguồn giữ trạng thái error, không dùng số 0 thay cho lỗi; dữ liệu mảng rỗng hợp lệ mới hiển thị 0. Ngày thiếu/sai không được tự tạo. Không có số liệu SLA/AI giả.
- RAG test xác nhận payload chỉ có question, các lượt độc lập, timeout 65 giây, chống gửi trùng, error/fallback, sao chép, role, nguồn và responsive.
- Nguồn chỉ mở khi đối chiếu được code với KB được phép xem; detail kiểm tra lại code/quyền. Nguồn không tìm được hiển thị chữ, không dựng link hỏng. Lỗi tra cứu nguồn không làm mất câu trả lời.
- Model/KB render bằng text React, không có `dangerouslySetInnerHTML`. Hội thoại không được lưu storage. Storage frontend hiện chỉ giữ phiên đăng nhập như trước.
- Fallback chỉ cho EMPLOYEE điền câu hỏi vào form Ticket; test xác nhận không có POST tạo Ticket cho tới khi người dùng chủ động gửi.
- Không kiểm chứng chất lượng câu trả lời/model/grounding thật trong UI 7; dành cho GĐ7.3.

## Smoke test thật, chỉ đọc

Đã gửi GET không có credential tới địa chỉ local mặc định, không đọc `.env`, không restart dịch vụ:

| Request | Kết quả thực đo |
| --- | --- |
| `http://127.0.0.1:5173/` | 200, khoảng 73 ms |
| `http://127.0.0.1:5000/api/health` | 200, success=true, khoảng 66 ms |
| `/api/health/db` | 200, success=true, khoảng 127 ms; controller chỉ `SELECT 1` |
| `/api/auth/me`, `/api/tickets`, `/api/knowledge`, `/api/users` không đăng nhập | Tất cả 401, khoảng 87–90 ms |

Các phép đo xác nhận dịch vụ phản hồi và chặn request thiếu xác thực; không chứng minh dữ liệu nghiệp vụ, phân quyền của token thật, hay backend đang chạy đúng từng dòng mã workspace. Không có smoke đăng nhập/đọc list theo tài khoản thật vì không sử dụng credential/token. Không gửi POST/PATCH/PUT/DELETE tới backend thật và không gửi câu hỏi RAG thật.

## Git và dữ liệu riêng

- `git status` xác nhận branch feature/local-rag; không có file staged. Các thay đổi backend/RAG từ giai đoạn trước còn nguyên, không phải thay đổi UI 7.
- `.env`, `.env.*` (trừ `.env.example`), `node_modules`, `dist`, `*.log`, `backend/.cache` được ignore. Đã kiểm tra rule cho backend/.env và cache ảnh test. Không có .env/log/cache/database binary trong kết quả kiểm tra tracked tương ứng.
- **Loại trừ `database/tk nv.sql` khỏi commit UI**: file SQL chưa theo dõi, tên gợi ý dữ liệu tài khoản cá nhân; chưa đọc nội dung nên không khẳng định có secret cụ thể.
- `backend/.env.example` là thay đổi cũ được Git theo dõi, không đọc trong lượt này; cần rà riêng placeholder trước commit backend.
- Quét dấu hiệu private key, Google API key, JWT dạng literal và credential gán trực tiếp trên **57 file mã nguồn/tài liệu thay đổi tại thời điểm kiểm tra** không có mẫu khớp. Không in nội dung trùng khớp, không đọc SQL cá nhân, .env hoặc .env.example. Đây là kiểm tra mẫu hạn chế, không phải chứng nhận không có secret.
- Không dùng `git add .`; khi được yêu cầu commit cần chọn file theo UI và backend riêng. Không đưa ảnh/profile test trong node_modules vào Git. UI 7 không stage, commit hoặc push.

## File sửa/tạo trong UI 7

1. `src/App.jsx`: reset instance Ticket theo role.
2. `src/Tickets.jsx`: xử lý 403/404 và đọc list an toàn.
3. `src/KnowledgeBase.jsx`: đọc list an toàn ở lần tải đầu và refresh sau ghi.
4. `src/responseData.js` (mới): kiểm tra response danh sách.
5. `scripts/audit-ui-checks.mjs` (mới): hồi quy các lỗi đã tái hiện.
6. `scripts/check-ui1.mjs`: nối suite UI 7 với fixture cô lập.
7. `package.json`: thêm `test:ui7`, không thêm dependency.
8. `UI7.md` (mới): báo cáo này.

## Chạy lại

Trong frontend, chạy `npm run build`, sau đó `npm run test:ui1` đến `npm run test:ui7`. Runner cần Node hỗ trợ WebSocket và Edge/Chrome đã cài. Không cài package mới. Từ root chạy `git diff --check`. File mới chưa tracked cần được kiểm tra riêng vì git diff thông thường chưa bao gồm chúng.

Để chạy riêng hồi quy: `node scripts/check-ui1.mjs --audit --audit-case=role` (hoặc denied, ticket-data, kb-data, responsive). Chỉ có fixture; không dùng token thật. Kết quả/ảnh ở thư mục ignored `frontend/node_modules/.cache/ui*-check`.

## Giới hạn và checklist nghiệm thu thủ công trước GĐ7.3

Chưa kiểm chứng trên database thật: đăng nhập từng vai trò, dữ liệu danh sách/chi tiết theo quyền, các giao dịch tạo/sửa/chuyển trạng thái và cạnh tranh giữa nhiều người dùng. Test responsive chạy giả lập viewport trên Edge, chưa thử thiết bị thật, Safari/Firefox, trình đọc màn hình đầy đủ hoặc tải dữ liệu lớn. Các ca response hỏng không bao phủ mọi biến thể có thể xảy ra. Điều hướng hiện dựa trên state; Back/Forward URL và khôi phục trang con sau reload chưa phải tính năng hỗ trợ. Ticket/KB/auth chưa có timeout chung như RAG/users/dashboard; kết nối treo là rủi ro cần theo dõi.

Checklist người nghiệm thu:

- [ ] Người dùng tự đăng nhập EMPLOYEE/IT/ADMIN trên local; kiểm tra logout, refresh phiên, nhãn tiếng Việt và menu đúng vai trò.
- [ ] Đối chiếu số Dashboard với danh sách thật cùng quyền; kiểm tra đủ 5 trạng thái, không tính lỗi nguồn thành 0.
- [ ] Chỉ đọc Ticket có sẵn: tìm/lọc, chi tiết, người phụ trách, lịch sử; EMPLOYEE không có thao tác IT.
- [ ] Chỉ đọc KB có sẵn: EMPLOYEE chỉ PUBLISHED; IT/ADMIN thấy đúng trạng thái. Mở form kiểm tra validation, hủy xác nhận để không ghi dữ liệu.
- [ ] Users chỉ hiện với ADMIN; thử tìm/lọc và Hủy/Escape ở hộp xác nhận. Không tự hạ quyền/vô hiệu hóa tài khoản thật chỉ để kiểm tra.
- [ ] Thử Tab/Shift+Tab/Enter/Escape và menu trên desktop/390px/320px; kiểm tra nội dung dài, focus, dấu tiếng Việt trên thiết bị dùng để bảo vệ đồ án.
- [ ] Chỉ khi chủ động nghiệm thu RAG: hỏi Wi-Fi, kiểm tra nguồn KB-000008 nếu backend trả nguồn đó, thử câu ngoài KB; kiểm tra Network payload chỉ `{question}`. Fallback mở form Ticket nhưng chưa gửi.
- [ ] Các ca ghi Ticket/KB/users chỉ thực hiện sau khi cho phép, tốt nhất trên database kiểm thử riêng với tài khoản kiểm thử; kiểm tra cả thành công, 403/409 và làm mới sau ghi.
- [ ] Rà diff và loại file cá nhân/secret/cache trước commit. Chốt giao diện rồi mới chạy thực nghiệm RAG GĐ7.3; không lấy kết quả mock làm kết quả đánh giá model.
