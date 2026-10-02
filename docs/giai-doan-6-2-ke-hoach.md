# Giai đoạn 6.2 – Kế hoạch kiểm thử End-to-End

**Trạng thái: CHƯA THỰC HIỆN.** Tài liệu được lập trong GĐ6.1; không phải kết quả test hoặc cho phép tự bắt đầu GĐ6.2. Baseline: [giai-doan-6-1.md](giai-doan-6-1.md), [stage6-1-results.json](stage6-1-results.json).

## Điều kiện và phương pháp dự kiến

Dùng code đã audit tại c4dda25c86fd7d9773be3294ff2d5b63e04c31d3 cùng commit tài liệu GĐ6.1; trước khi chạy phải xác minh Git/commit, schema, snapshot và môi trường thật. Mốc dữ liệu GĐ6.1: users=3, tickets=3, history=17, KB=8 PUBLISHED; nếu khác thì ghi số thật, không ép lại.

Giữ nguyên workflow và quyền đã chốt. Dùng browser với API/MySQL thật cho luồng nghiệp vụ; dữ liệu ghi mới phải có định danh riêng, ghi lại ID/creator và cleanup chính xác trong finally/transaction. Không xóa bản ghi có sẵn, không reset AUTO_INCREMENT. Status/role negative ưu tiên user tạm; không thử khóa ADMIN gốc. Snapshot nhạy cảm chỉ giữ trong bộ nhớ; chỉ lưu số lượng và kết quả so sánh.

RAG mặc định provider mock có đánh dấu rõ; retrieval local có thể thật. Không dùng mock để kết luận chất lượng Gemini thật. GĐ6.2 không mặc nhiên được gọi thêm Gemini, thay threshold/model/prompt/validator hoặc chạy lại 24 câu. Ca cần nguồn trả lời thành công phải ghi mode MOCK/REAL, không lẫn bằng chứng.

## FLOW 1 – EMPLOYEE tạo và xem Ticket

- Login EMPLOYEE bằng cấu hình demo runtime, không ghi credential/token.
- Mở Ticket của tôi, chọn Tạo yêu cầu, gửi title/description hợp lệ.
- Kỳ vọng 201, code từ ID thật, created_by là EMPLOYEE, NEW/LOW, assigned_to null.
- Xem list/detail và history khởi tạo null→NEW; reload vẫn thấy Ticket của mình.
- Bằng chứng dự kiến: HTTP đã loại secret, ID/code dữ liệu test, screenshot không chứa credential.

## FLOW 2 – IT tiếp nhận và xử lý

- IT login, xem Ticket FLOW 1, tiếp nhận NEW→RECEIVED; assigned_to là IT hiện tại.
- Đổi LOW/MEDIUM/HIGH thủ công; bắt đầu IN_PROGRESS, thử RESOLVED thiếu solution phải 400 và không tăng history.
- Gửi solution hợp lệ: RESOLVED; thử RESOLVED→IN_PROGRESS rồi RESOLVED với solution mới.
- Chỉ đóng CLOSED sau bước xác minh EMPLOYEE ở FLOW 3; thử thay đổi CLOSED phải bị chặn.
- Kỳ vọng mỗi chuyển trạng thái đúng một history, actor server; lỗi không cập nhật một phần. Priority không tạo history trạng thái.
- Không tự thêm endpoint phân công người khác.

## FLOW 3 – EMPLOYEE xem lại kết quả

- Dùng EMPLOYEE tạo Ticket ở FLOW 1, đăng nhập lại hoặc refresh.
- Xác minh RESOLVED/solution/IT/history nhất quán với FLOW 2; sau IT đóng thì hiển thị CLOSED.
- EMPLOYEE không có nút xử lý/priority; yêu cầu API trực tiếp tương ứng bị 403.
- EMPLOYEE khác không list/detail Ticket này; dùng user tạm nếu cần, không đổi chủ Ticket thật.

## FLOW 4 – IT/ADMIN quản lý Knowledge Base

- Với bài test mới: tạo DRAFT, sửa title/content, xuất bản PUBLISHED, ARCHIVED, quay DRAFT.
- Kiểm tra code/created_by giữ nguyên; updated_by theo actor; transition sai bị chặn.
- IT và ADMIN đều quản lý được bài test, kể cả không phải người tạo.
- Validation: whitespace, title biên, content vượt JSON 16 KB, ID không hợp lệ; không đổi bài seed.
- Bổ sung ca title ngoài BMP để đánh giá P2-05; nếu khác UI/API thì ghi đúng lỗi, không đổi code để ép PASS.

## FLOW 5 – EMPLOYEE đọc KB PUBLISHED

- Xác minh list/detail/search code/title với bài test PUBLISHED.
- Bài DRAFT/ARCHIVED không xuất hiện; gọi trực tiếp detail bị 403.
- Không có nút tạo/sửa/status; API tương ứng bị 403.
- Search trim/không phân biệt hoa thường, rỗng, không có kết quả; không kỳ vọng bỏ dấu/tìm content.
- Đổi trạng thái bài test bằng IT rồi EMPLOYEE refresh; không chỉnh 8 bài thật.

## FLOW 6 – EMPLOYEE hỏi RAG có nguồn

- Gửi câu hợp lệ, kiểm loading/disable, chống gửi trùng, Enter/Shift+Enter/IME.
- Với provider mock hợp lệ: answer text giữ newline và code/title sources đúng response; không HTML injection.
- Nếu integration service dùng mock generate, evidence phải literal-match context PUBLISHED; không dựng PASS bằng response bỏ qua validator khi đang kiểm backend.
- Tách test UI mock route và integration mock provider. Không suy ra accuracy Gemini từ ca mock.
- UI không hiển thị cosine thành confidence và không tạo link nguồn khi contract thiếu ID.

## FLOW 7 – Ngoài KB → fallback → chủ động Ticket

- Dùng câu OUT đã biết, retrieval local thật dưới ngưỡng; xác minh không gọi provider.
- UI answered=false, sources rỗng, thông báo thiếu dữ liệu; EMPLOYEE có nút chuyển sang Ticket.
- Click nút chỉ điều hướng; xác minh 0 POST /tickets trước khi người dùng gửi form.
- Tự chọn Tạo yêu cầu, nhập và gửi: chỉ một Ticket test được tạo với creator đúng.
- IT/ADMIN fallback không có nút tạo; không tự mở rộng quyền POST /tickets.

## FLOW 8 – RBAC negative và IDOR

| Ca dự kiến | Kỳ vọng |
| --- | --- |
| Thiếu token/sai chữ ký/hết hạn | 401, không lộ stack |
| INACTIVE user tạm: login/token đã cấp | 401; phục hồi hoặc dọn user test |
| EMPLOYEE đọc Ticket người khác | 403; list không chứa Ticket đó |
| IT thứ hai xử lý Ticket gán IT thứ nhất | 403, dữ liệu/history không đổi |
| IT/ADMIN POST tạo Ticket | 403 |
| EMPLOYEE sửa KB; IT/EMPLOYEE quản lý users | 403 |
| ADMIN xử lý Ticket của IT | Đúng quyền nhưng vẫn phải theo workflow |
| Đổi role user tạm rồi dùng token cũ | Quyền mới từ DB có hiệu lực |
| Truy cập KB không PUBLISHED/RAG nguồn ẩn | EMPLOYEE bị chặn; nguồn RAG không được dùng |

Không thử self-demote/INACTIVE ADMIN cuối trên dữ liệu thật. P2-04 cần chốt chính sách trước khi thiết kế kiểm thử kỳ vọng cho quy tắc mới.

## FLOW 9 – Reload, session và error handling

- Reload/focus/logout ba role; token chỉ sessionStorage, không log/lưu password.
- Ghi nhận reload về Ticket và mất câu/form chưa gửi là hành vi hiện tại.
- Mô phỏng mạng lỗi, 401/403/404/429/500/502/503/504, request abort/timeout; phân biệt mock với integration thật.
- RAG malformed output/evidence lỗi không hiển thị answer giả; không lộ raw SDK/key.
- Chuyển tab trong khi pending không cập nhật component cũ hoặc tự tạo Ticket.
- Lỗi /auth/me tạm thời có đường thử lại; 401 buộc về login.

## FLOW 10 – Responsive và khả năng sử dụng

- Desktop và viewport nhỏ 390px; navigation, form, KB, RAG và bảng Ticket.
- Không tràn toàn trang; bảng cuộn trong vùng riêng; text dài xuống dòng.
- Keyboard focus, nhãn form, trạng thái lỗi/loading, nút bị disable đúng lúc.
- Ghi rõ Edge/viewport thực kiểm; không suy rộng mọi trình duyệt/thiết bị.

## Bằng chứng và điều kiện kết thúc dự kiến

Mỗi flow phải có timestamp, commit source, môi trường, mode mock/real, bước thực hiện, kết quả quan sát, PASS/FAIL/NOT_RUN và lý do. Không đánh PASS cho bước chưa chạy. Ghi request Gemini thực tế (mặc định 0), build và snapshot trước/sau; backup/restore báo cáo cũ để không thay lịch sử.

Nếu có lỗi, phân loại theo GĐ6.1, giữ output thất bại; chỉ sửa theo phạm vi GĐ6.2 được phê duyệt sau này. Không tự đổi kiến trúc/schema, xóa dữ liệu thật hoặc mở rộng sang GĐ6.3. Dừng khi có secret nguy cơ commit hoặc lỗi nghiêm trọng làm baseline không đáng tin.

**Cả 10 flow ở tài liệu này hiện là kế hoạch, chưa chạy như bộ E2E GĐ6.2.**
