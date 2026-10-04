# Kịch bản demo cuối GĐ6.4 — khoảng 9 phút

Chuẩn bị: MySQL local `it_support_rag`, backend và frontend theo README, ba role ACTIVE đã kiểm chứng. Dùng thông tin đăng nhập local riêng; không mở `.env`, password, JWT hoặc tab Network khi chiếu. Không seed lại dữ liệu. Cổng 5173 phải trống trước chạy test tự động; không chạy test cùng lúc thao tác demo.

Bản kiểm chứng GĐ6.4 dùng E5/retrieval thật và Gemini mock, **0 request Gemini thật**. Hình có `[MOCK Gemini]` chỉ minh họa pipeline/UI, không phải chất lượng model live. Khi trình bày, dùng hình minh chứng mock có nhãn và số liệu thực nghiệm GĐ5.4 đã lưu. Nếu chạy ứng dụng bình thường và gửi câu trong KB, backend sẽ gọi Gemini thật; việc đó không thuộc lượt kiểm chứng này. Không hứa answer luôn thành công khi quota/mạng/provider thay đổi.

| Thời gian | Thao tác / nội dung trình bày | Điều cần chỉ rõ |
| --- | --- | --- |
| 0:00–0:40 | Giới thiệu bài toán hỗ trợ CNTT nội bộ: quản lý yêu cầu, tra cứu hướng dẫn và hỏi đáp có nguồn. | RAG hỗ trợ tra cứu; nhân viên IT chịu trách nhiệm xử lý yêu cầu. |
| 0:40–1:10 | Giới thiệu EMPLOYEE, IT, ADMIN; đăng nhập EMPLOYEE, xem tên/role và Ticket của mình. | Quyền được kiểm ở backend và dữ liệu user hiện tại. |
| 1:10–2:00 | Chọn Tạo yêu cầu, nhập “Không kết nối được Wi-Fi văn phòng”, mô tả triệu chứng rồi chủ động gửi; mở Ticket mới. | NEW, LOW mặc định, creator lấy từ phiên. Ghi lại code thực tế, không giả định ID cố định. |
| 2:00–3:10 | Đăng nhập IT, mở đúng code, Tiếp nhận, đổi priority HIGH, Bắt đầu xử lý. Nhập solution rồi đánh dấu đã giải quyết. | Người tiếp nhận là assignee; RESOLVED bắt buộc solution. Demo chỉ mô phỏng xử lý, không tuyên bố đã sửa máy thật. |
| 3:10–3:40 | Xem Ticket History; EMPLOYEE đăng nhập lại xem giải pháp. | NEW → RECEIVED → IN_PROGRESS → RESOLVED; IT có thể xử lý lại hoặc đóng. CLOSED không mở lại. |
| 3:40–4:50 | EMPLOYEE tìm “Wi-Fi” trong KB và mở chi tiết. Chuyển IT, tạo một DRAFT demo, sửa, xuất bản, lưu trữ và chuyển về nháp. | EMPLOYEE chỉ thấy PUBLISHED. Search code/title là từ khóa; không phải semantic retrieval. Không sửa tám bài gốc. |
| 4:50–5:50 | Mở hình `08-rag-answer-with-source-mock.png`, đọc câu hỏi và chỉ nguồn KB. | Hình chạy UI/API/E5/context/validator thật, provider mock có nhãn. Trình bày riêng thực nghiệm Gemini lịch sử ở dưới. |
| 5:50–6:30 | Hỏi “Nhân viên mới có bao nhiêu ngày nghỉ phép năm?”; hoặc mở hình fallback mới. EMPLOYEE chọn Tạo yêu cầu hỗ trợ, mở form rồi Hủy. | Retrieval dưới ngưỡng trả fallback, không gọi Gemini; điều hướng không tự tạo Ticket. |
| 6:30–7:15 | Đăng nhập ADMIN, xem Ticket/KB; mở kết quả kiểm thử ADMIN cuối trong JSON/báo cáo đã loại secret. | “ADMIN quản lý Users qua API; chưa có màn hình Users riêng.” Self-demote/INACTIVE ADMIN cuối nhận 409, database không đổi. Không chiếu header Authorization. |
| 7:15–8:10 | Trình bày kiến trúc và số liệu lịch sử bên dưới. | Tách độ đúng retrieval, groundedness và kiểm thử phần mềm. |
| 8:10–9:00 | Mở ảnh mobile 390px; nói rõ hạn chế và hướng phát triển. | Hai P2 còn MITIGATED, bốn nhóm P3; không tuyên bố production-ready. |

Kiến trúc để thuyết trình: KB PUBLISHED → chunking → multilingual E5 local 384 chiều → vector RAM → cosine similarity; câu hỏi qua query embedding → threshold/context → Gemini `gemini-3.5-flash-lite` → kiểm evidence/nguồn → answer + sources hoặc fallback. Ngưỡng giữ `0.8504602347669256`. Vector RAM chưa phải vector database.

Số liệu **lịch sử**, không phải đo mới GĐ6.4: 8 bài, 24 chunks, 24 câu; Top-1 Retrieval trên DIRECT + PARAPHRASE **15/16 = 93,75%**, Hit@3 **16/16**. GĐ5.4 gọi Gemini 18 lần, cho **14 answer / 8 fallback / 2 lỗi evidence**; groundedness **13 PASS / 1 PARTIAL trên 14 answer**, nguồn đúng **14/14**. Không nói “RAG chính xác 93,75%”. Nguồn: [tổng kết GĐ5.6](giai-doan-5-6.md), [JSON GĐ5.4](stage5-4-results.json).

Sau GĐ6.3, evidence dài được xác minh toàn quote trước rút gọn excerpt; replay hết lỗi length nhưng số liệu GĐ5.4 vẫn giữ nguyên. Câu mơ hồ/khẳng định nguyên nhân chưa được chứng minh giải quyết hoàn toàn. Chưa kiểm trên máy sạch; corpus nhỏ, chưa người chấm độc lập, chưa chat memory/streaming, chưa UI Users. Hướng phát triển chỉ đề xuất: tập đánh giá lớn hơn, đánh giá độc lập, cải thiện triển khai và UX theo phạm vi được duyệt.

Nếu API/provider gặp lỗi khi trình diễn: giữ nguyên thông báo lỗi, giải thích phạm vi, chuyển sang ảnh minh chứng có nhãn và kết quả lịch sử. Không sửa threshold/model, không gắn nhãn live cho mock, không tạo đáp án giả. Không gửi lặp để tiêu quota.

Dữ liệu tạo trong buổi trình diễn thủ công là dữ liệu mới của buổi đó; ghi nhận code/ID và xử lý riêng sau buổi. Không chạy SQL xóa theo khoảng ID hoặc reset bảng. Lượt kiểm chứng tự động GĐ6.4 có cleanup/fingerprint riêng trong báo cáo.
