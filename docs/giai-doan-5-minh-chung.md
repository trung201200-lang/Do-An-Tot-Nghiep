# Checklist minh chứng phần RAG – Giai đoạn 5

Đây là danh sách **đề xuất cần chụp**, không phải tuyên bố đã có đủ hình. Ghi ngày/phiên bản khi chụp, dùng dữ liệu demo. Ảnh thực nghiệm lịch sử cần chú thích thuộc GĐ5.3/5.4/5.5, không đổi thành kết quả mới GĐ5.6. GĐ5.6 không gọi Gemini để chụp lại answer.

| Hoàn tất | Hình | Mở màn hình nào | Nên chụp phần nào | Chứng minh điều gì |
| --- | --- | --- | --- | --- |
| [ ] | 1. Cấu trúc MySQL | Workbench, schema it_support_rag | Cây Tables với users, tickets, ticket_history, knowledge_articles | Bốn bảng nghiệp vụ đã có; không có bảng chat/vector mới |
| [ ] | 2. Tám KB PUBLISHED | Workbench với SELECT id, code, title, status FROM knowledge_articles ORDER BY id | Tám dòng kết quả và status, đủ tiêu đề/mã | Corpus gồm 8 bài PUBLISHED thực tế |
| [ ] | 3. Đăng nhập | Frontend khi chưa đăng nhập | Tiêu đề hệ thống, ô email và ô mật khẩu **để trống** | Luồng xác thực người dùng; không chụp credential |
| [ ] | 4. EMPLOYEE gửi yêu cầu | Đăng nhập EMPLOYEE → Ticket của tôi | Form tạo đang chưa gửi hoặc chi tiết Ticket demo có sẵn | EMPLOYEE gửi yêu cầu bằng cách tạo Ticket; xem Ticket của mình |
| [ ] | 5. IT xử lý Ticket | Đăng nhập IT → Ticket demo phù hợp người được giao | Trạng thái, người tiếp nhận, giải pháp và history | IT tiếp nhận/xử lý theo workflow; chỉ thao tác thật khi chủ động tạo dữ liệu demo riêng |
| [ ] | 6. Knowledge Base | Kho kiến thức bằng EMPLOYEE | Danh sách bài và chi tiết một bài PUBLISHED | Có nguồn tri thức gốc để đối chiếu hướng dẫn |
| [ ] | 7. Trợ lý – nhập câu hỏi có nguồn | Trợ lý CNTT | Câu “Không kết nối được Wi-Fi thì cần kiểm tra gì trước?” trong form, nút gửi | Cách người dùng nhập câu hỏi; chỉ nhập chưa gửi không gọi Gemini |
| [ ] | 8. Trợ lý – answer + source | Kết quả thật sau request câu Wi-Fi hoặc ảnh thật GĐ5.5 còn lưu | Câu hỏi, toàn answer, KB-000008 và tiêu đề nguồn | UI hiển thị đúng answer/nguồn từ backend; phải chú thích nếu dùng ảnh lịch sử |
| [ ] | 9. Ngoài KB → fallback | Trợ lý CNTT, câu về ngày nghỉ phép năm | Câu hỏi, tiêu đề thiếu thông tin, fallback và không có nguồn | Fallback UI; để chứng minh không gọi Gemini cần đối chiếu JSON/test, ảnh riêng không chứng minh network backend |
| [ ] | 10. Fallback → Ticket | EMPLOYEE tại fallback | Nút Tạo yêu cầu hỗ trợ; thêm ảnh sau click sang Ticket nếu cần | Điều hướng chủ động; không tự POST tạo Ticket |
| [ ] | 11. Terminal Retrieval logic | Terminal tại backend: node tests/stage5-3-logic.cjs | Tên test, PASS và phần kết thúc | Kiểm logic retrieval; không coi test fixture như accuracy ngữ nghĩa |
| [ ] | 12. Kết quả GĐ5.3 | docs/giai-doan-5-3.md hoặc stage5-3-results.json | Bảng A/B 15/16, expected 19/20, Hit@3/5, threshold/false reject | Chỉ số Retrieval lịch sử có mẫu số; không ghi “RAG chính xác 93,75%” |
| [ ] | 13. Kết quả GĐ5.4 | docs/giai-doan-5-4.md hoặc stage5-4-results.json | 24 câu, 18 calls, 14 answer/8 fallback/2 lỗi; 13 PASS/1 PARTIAL và 14/14 nguồn | Chất lượng generation và hạn chế; giữ cả evidence error/B01/C03 |
| [ ] | 14. Responsive | Browser viewport 390×844, Trợ lý CNTT | Form, answer/fallback và nguồn trong chiều rộng mobile | Khả năng dùng ở màn hình nhỏ; nếu dùng ảnh fixture phải ghi rõ đó là kiểm UI |

## Lưu ý khi thu minh chứng

- Không chụp backend/.env, API key, JWT_SECRET, password, token, Authorization header hoặc DevTools storage. Với bảng users chỉ chọn id/name/role/status nếu cần; không SELECT password/hash để chụp.
- Hình 8 cần answer thật. Nếu tự gửi mới sẽ phát sinh một lượt Gemini do người dùng chủ động; không cần chạy bộ 24 câu. Không dựng ảnh answer rồi gọi là kết quả tích hợp thật.
- Nếu dùng ảnh stage3-ticket-demo.png hoặc stage4-4-knowledge.png đã có trong docs, ghi đúng giai đoạn cũ; không sửa nhãn thời gian hoặc giả rằng ảnh được chụp trong GĐ5.6. Ảnh tạm browser có thể bị xóa/ghi đè, cần kiểm tra nội dung trước dùng.
- Chụp Ticket bằng dữ liệu đang có nếu chỉ cần xem. Không chỉnh Ticket thật hoặc tạo/xóa dữ liệu chỉ để có trạng thái đẹp; nếu demo thao tác mới, tách dữ liệu demo và quản lý việc dọn đúng bản ghi.
- Nguồn số liệu chính: stage5-3-results.json, stage5-4-results.json, stage5-5-results.json. Kết quả kiểm thử cuối và hash nguồn ở stage5-6-results.json.
- Có thể đặt tên hình theo thứ tự 01–14 và thêm caption: vai trò, chức năng, phiên bản commit, dữ liệu thật hay fixture, kết luận vừa đủ. Ảnh minh họa UI không thay thế kết quả test hoặc đánh giá groundedness.

## Caption mẫu

“Hình 8. EMPLOYEE hỏi về Wi-Fi qua Trợ lý CNTT. Backend trả answer kèm nguồn KB-000008. Ảnh minh họa luồng tích hợp; không đại diện accuracy của toàn hệ thống.”

“Hình 12. Top-1 Retrieval Accuracy trên 16 câu DIRECT + PARAPHRASE đạt 15/16; B05 sai Top-1, B03/B07 bị ngưỡng từ chối nhầm. Số liệu từ GĐ5.3, không phải một lần đo mới.”
