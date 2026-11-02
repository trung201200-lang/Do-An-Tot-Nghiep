# UI 4 — Trợ lý AI RAG

## Phạm vi triển khai

- Giao diện hội thoại dùng AppShell và design tokens hiện có. Từng lượt hiển thị câu hỏi, đang xử lý, câu trả lời/nguồn, fallback hoặc lỗi riêng.
- Bốn gợi ý Wi-Fi, máy in, email, máy tính chậm chỉ điền ô nhập và chuyển focus; người dùng chủ động gửi.
- Mỗi lần gọi `POST /rag/ask` chỉ có `{question}`. Không gửi lịch sử, provider, model, URL hoặc thông tin nguồn lên endpoint này. Giao diện nói rõ backend không ghi nhớ lượt trước.
- Giữ nguyên giới hạn 1000 Unicode code points, trim câu hỏi, Enter gửi / Shift+Enter xuống dòng, chặn Enter trong IME composition, `pending` ref chống gửi trùng, AbortController và timeout 65000 ms. Rời màn hình sẽ abort request đang chờ.
- Lượt hỏi chỉ nằm trong React state của màn hình, không tự lưu localStorage/sessionStorage. Rời menu, reload, logout hoặc đổi vai trò sẽ bỏ hội thoại. Không thay đổi cơ chế session đăng nhập hiện có.
- Model output, câu hỏi, mã/tiêu đề nguồn và nội dung KB được render bằng text React, giữ xuống dòng. Không render HTML/Markdown hoặc dùng `dangerouslySetInnerHTML`.

## Nguồn tham khảo

Sau câu trả lời thành công đầu tiên, frontend gọi `GET /knowledge` bằng phiên hiện tại để đối chiếu `source.code` với ID thật trong danh sách được phép xem. Với EMPLOYEE, chỉ nhận bài PUBLISHED làm nguồn có thể mở. Mã không khớp hoặc lỗi tải danh sách chỉ hiển thị văn bản; không đoán ID hoặc tạo URL từ model output.

Nhấn nguồn đã khớp gọi `GET /knowledge/:id` và mở hộp đọc chỉ xem, tái sử dụng `KnowledgeDetail` của UI 3. Có loading, Escape, vòng focus và nút đóng. Request đọc nguồn có timeout riêng 15 giây; không thay đổi timeout hỏi RAG. Bài thay đổi/không còn quyền xem được báo lỗi an toàn và bỏ nút mở nguồn đó trong phiên. Lỗi đọc nguồn không xóa câu trả lời. 401 vẫn kích hoạt logout.

Không đổi code hay workflow Knowledge Base. Đối chiếu mã nguồn chỉ phục vụ mở bài; frontend không bổ sung cơ chế chứng minh mọi khẳng định trong câu trả lời. Validation và thuật toán RAG backend được giữ nguyên.

## Sao chép và chuyển sang Ticket

- Nút sao chép dùng `navigator.clipboard.writeText` khi người dùng bấm, có thông báo thành công/thất bại. Trình duyệt không hỗ trợ hoặc từ chối quyền sẽ hướng dẫn sao chép thủ công; không đọc clipboard.
- Chỉ EMPLOYEE thấy nút **Tạo yêu cầu hỗ trợ** khi API trả `answered: false`. Nút này mở form Ticket với tiêu đề “Yêu cầu hỗ trợ từ Trợ lý AI” và mô tả là toàn bộ câu hỏi của lượt đó.
- Chỉ chuyển câu hỏi; không chép câu trả lời model thành giải pháp Ticket, không tự gọi POST. Người dùng sửa/kiểm tra rồi bấm **Gửi yêu cầu** qua form và validation UI 2 hiện có.
- `App.jsx`, `Tickets.jsx`, `TicketViews.jsx` chỉ bổ sung đường truyền state/props điền sẵn. Giữ nguyên API/payload, phân quyền, tiếp nhận, ưu tiên và chu trình trạng thái Ticket. Hủy form rồi tạo thủ công phải được form trống.

## Kiểm thử

Trong `frontend`:

```powershell
npm run build
npm run test:ui1
npm run test:ui2
npm run test:ui3
npm run test:ui4
```

Tại thư mục project:

```powershell
git diff --check
```

Runner dùng Edge/Chrome cài sẵn và Node có WebSocket. Bản build được phục vụ trên cổng loopback tạm, chặn mọi request của trang qua CDP. API dùng fixture trong bộ nhớ; request ngoài phạm vi bị chặn. Test sao chép thay clipboard bằng stub trong trang kiểm thử nên không đọc/ghi clipboard thật.

UI 4 kiểm tra gợi ý, payload độc lập, chống gửi trùng, thành công, nguồn hợp lệ/không khớp/lỗi quyền, XSS text escaping, sao chép thành công/thất bại, hội thoại nhiều lượt, Unicode/IME/Enter, fallback sang Ticket (không POST trước khi người dùng gửi), form trống sau hủy, lỗi mạng/HTTP/provider/schema, timeout, unmount, logout, đổi vai trò và mobile 390/320px.

Test timeout chặn response giả lập, thay bộ hẹn giờ **chỉ trong trang test** để chạy nhanh và xác minh production vẫn đăng ký đúng 65000 ms; không đợi model thật, không thay timeout code production. Test không gọi Gemini/Ollama hay database thật, không cần đọc `.env` hoặc cài package.

Ảnh/profile kiểm thử nằm dưới `frontend/node_modules/.cache/ui4-check`, được Git bỏ qua. Fixture không được import vào ứng dụng thật.

## Kiểm tra trực tiếp

1. Mở **Trợ lý AI**. Chọn Wi-Fi: chỉ ô nhập thay đổi, chưa có request RAG. Bấm **Gửi câu hỏi** hoặc Enter; thử Shift+Enter để xuống dòng.
2. Gửi câu hỏi tiếp theo có đầy đủ thông tin. Hai lượt phải còn trên màn hình, mỗi request trong Network chỉ có `question`.
3. Với câu trả lời thành công, kiểm tra mã/tiêu đề nguồn; mở nguồn có nút, đọc bài rồi đóng bằng Escape. Nguồn không đối chiếu được chỉ là văn bản.
4. Bấm **Sao chép câu trả lời**, kiểm tra thông báo và nội dung được sao chép.
5. Khi có fallback, EMPLOYEE chọn **Tạo yêu cầu hỗ trợ**: form có mô tả đúng câu hỏi, chưa tạo Ticket. Kiểm tra/sửa rồi chỉ gửi nếu chủ động muốn tạo Ticket thật. IT/ADMIN không có nút tạo này.
6. Thử Tab/Shift+Tab/Enter/Escape, mobile 390px/320px. Rời màn hình rồi quay lại: hội thoại đã được xóa.

## Giới hạn còn lại

- Chưa kiểm thử model thật hoặc ghi database thật trong giai đoạn giao diện này. Test clipboard dùng stub; quyền clipboard thực tế tùy trình duyệt/secure context.
- Không có streaming, lịch sử bền vững, rich text hoặc ngữ cảnh hội thoại phía backend.
- Danh sách để đối chiếu nguồn được tải một lần sau câu trả lời thành công đầu tiên trong phiên; nguồn mới xuất hiện sau đó có thể chỉ là văn bản đến khi mở lại màn hình. Chi tiết và quyền được kiểm tra lại khi mở bài.
- Chưa kiểm thử đầy đủ bằng trình đọc màn hình, nhiều trình duyệt hoặc hội thoại rất dài. Việc abort phía trình duyệt không bảo đảm tác vụ model đang chạy trên backend bị hủy.
