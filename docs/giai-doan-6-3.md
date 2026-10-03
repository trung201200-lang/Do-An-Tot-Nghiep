# Giai đoạn 6.3 – Khắc phục có chọn lọc các P2 trước demo

## 1. Mục tiêu

Tái hiện, phân tích, sửa tối thiểu và kiểm chứng năm P2 đã ghi ở GĐ6.1/6.2. Kết quả mới là **POST-FIX VERIFICATION**, không thay kết quả thực nghiệm GĐ5. Báo cáo máy đọc: [stage6-3-results.json](stage6-3-results.json).

## 2. Baseline

Trước sửa đã kiểm git status/status -sb/log -5/rev-parse: main sạch, HEAD = origin/main = **7aad0fe91aa515dd3d3c3cbf9c22466b7d2818dc**, message **test: add end-to-end system verification**.

Đã đọc docs/giai-doan-6-1.md, stage6-1-results.json, giai-doan-6-2.md, stage6-2-results.json và các ca GĐ5.4 liên quan. Baseline GĐ6.2: 10 flow/28 bước, 8 responsive, 206 regression và build PASS. Đây là số liệu lịch sử; lượt chạy mới có timestamp và chi tiết riêng trong JSON.

## 3. Phạm vi

Sửa năm file ứng dụng: userModel.js, errorMiddleware.js, generationPrompt.js, generationOutput.js, KnowledgeBase.jsx. Bổ sung hai npm script, một đoạn README, hai runner và hai báo cáo GĐ6.3. Không thêm dependency, không sửa lockfile/schema/role/workflow, không thay Gemini model/key, embedding/chunking/threshold hoặc kiến trúc. Không thêm User Management UI.

| P2 | Trước | Quyết định | Sau | Trạng thái |
| --- | --- | --- | --- | --- |
| P2-01 Grounding/mơ hồ | B01 khẳng định nguyên nhân; C03 thiếu làm rõ | Bổ sung instruction tối thiểu | Có yêu cầu điều kiện/làm rõ; chưa chứng minh model live tuân thủ | MITIGATED |
| P2-02 Evidence dài | Quote khớp nhưng quá 500 bị reject | Kiểm toàn bộ quote rồi rút gọn excerpt | A03/C01 hết lỗi length; suffix bịa vẫn reject | FIXED về length |
| P2-03 Tái lập test | Thiếu script/prerequisite tập trung, phụ thuộc môi trường | Tách logic không secret và integration có hướng dẫn | Chạy được ở môi trường hiện tại; chưa máy sạch/CI | MITIGATED |
| P2-04 ADMIN cuối | Model cho phép hạ role/INACTIVE ADMIN duy nhất | Transaction + locking read + kiểm invariant | HTTP 409 khi mất ADMIN cuối; ca hợp lệ vẫn chạy | FIXED |
| P2-05 Unicode | HTML UTF-16 khác backend code point | Đếm code point sau trim tại frontend | Biên 255/256 thống nhất trên UI/API | FIXED |

Không có mục DOCUMENTED/DEFERRED hoặc NOT REPRODUCED. FIXED không có nghĩa đã chứng minh hệ thống không còn mọi rủi ro.

## 4. Database trước

MySQL local it_support_rag: users=3, tickets=3, ticket_history=17, knowledge_articles=8; 8 KB PUBLISHED. Snapshot đầy đủ ở bộ nhớ; fingerprint tổng và số lượng ở JSON, không ghi dump/hash mật khẩu/JWT vào báo cáo.

Fixture ADMIN/KB có marker và UUID, giữ ID/code/email để cleanup chính xác. Chỉ tạo/dọn dữ liệu tạm; không seed, không chỉnh dữ liệu gốc để ép baseline.

## 5. P2-01 trước fix

Replay B01/C03 từ output lịch sử vào normalizeOutput vẫn được chấp nhận. B01 mở đầu kết luận sự cố do Wi-Fi bị tắt; dấu hiệu người dùng chưa đủ xác nhận nguyên nhân. C03 tự đưa hướng dẫn cho trang làm việc chưa xác định mà không hỏi rõ.

Nhãn GĐ5.4 giữ nguyên: B01 groundedness PARTIAL; C03 groundedness PASS nhưng insufficient-context FAIL. Tái hiện mới ghi phase PRE_FIX, không gọi Gemini.

## 6. Phân tích P2-01

Literal evidence xác minh trích dẫn thuộc nguồn, không xác minh ý nghĩa mọi claim trong answer. Prompt cũ đã nói cần làm rõ nhưng chưa cụ thể về việc không biến danh sách khả năng thành chẩn đoán chắc chắn. Thêm semantic classifier hoặc chat memory vượt phạm vi; không chọn các hướng đó.

## 7. Thay đổi P2-01

Bổ sung hai đoạn instruction: phân biệt “có thể/hãy kiểm tra” với kết luận nguyên nhân; nếu thiếu tên ứng dụng/trang, loại tài nguyên hoặc lỗi cụ thể thì nói rõ thông tin cần thêm, chỉ hướng dẫn có điều kiện. Giữ QUESTION/CONTEXT ở dữ liệu JSON riêng; không thêm ví dụ gắn cứng B01/C03 hoặc đổi model.

## 8. Kết quả P2-01

Hai test prompt/fixture an toàn PASS. Fixture mô phỏng trả lời thận trọng vẫn qua validator và có nguồn. API replay B01/C03 cũng chạy với auth thật.

**Giới hạn quan trọng:** phát lại chính answer cũ thì validator vẫn chấp nhận; thêm prompt không sửa ngữ nghĩa output cũ. Không dùng mock để kết luận Gemini đã hết hallucination. **MITIGATED**, chưa FIXED; chưa có kiểm chứng Gemini live sau sửa.

## 9. P2-02 trước fix

A03/C01 có quote đầu dài 537/679 đơn vị UTF-16; cả hai khớp literal trong context nhưng bị GEMINI_INVALID_EVIDENCE do điều kiện value.length > 500. Kết quả PRE_FIX đã tái hiện đúng lỗi trước khi sửa.

## 10. Phân tích P2-02

Giới hạn độ dài excerpt đang gắn với việc chấp nhận toàn answer. Không cần tăng một ngưỡng lớn hoặc tắt source verification. Có thể xác minh toàn bộ quote rồi giữ excerpt ngắn trong trace; API vốn không trả evidence nội bộ cho frontend.

## 11. Thay đổi P2-02

Chuẩn hóa quote như trước, yêu cầu tối thiểu 20 ký tự, kiểm **toàn bộ quote** nằm trong context rồi mới cắt excerpt tối đa 500 UTF-16, không để surrogate pair bị cắt đôi. Sources được xác định từ full quote và context trước khi cắt. Prompt vẫn khuyến khích evidence ngắn 20–500.

Giữ giới hạn 8 evidence, schema output, answer limit, secret check và nguồn từ context. Quote bịa sau vị trí 500 vẫn bị từ chối; không cắt trước để bỏ mất phần bịa. Độ dài quote được chấp nhận bị giới hạn tự nhiên bởi context thật đã có ngân sách, không chấp nhận văn bản tùy ý.

## 12. Kết quả P2-02

Replay A03/C01 PASS về contract/source: excerpt đầu còn 500, nguồn lần lượt KB-000010/KB-000013; answer text không bị thay. Test quote bịa, suffix bịa sau 500, quote ngắn/rỗng/sai kiểu, quá số lượng, NFC/CRLF, surrogate và fallback đều PASS. HTTP replay cả hai trả 200.

A03 là ứng viên lịch sử có căn cứ; **C01 vẫn có vấn đề tự hiểu “tài nguyên” thành thư mục mạng**. HTTP 200 của C01 chỉ chứng minh hết lỗi length, không biến groundedness/clarification thành PASS. Giới hạn ngữ nghĩa thuộc P2-01 vẫn tồn tại. **FIXED riêng P2-02.**

## 13. P2-03 – Khả năng tái lập

Hai package-lock tồn tại. Thêm:

~~~powershell
# Trong backend:
npm run test:stage6-3
npm run test:stage6-3:integration
~~~

Logic mặc định dùng replay/mock trong bộ nhớ, không đọc .env, không MySQL/browser/model cache/Gemini. Đã chạy 17 test với mọi biến KEY/SECRET/PASSWORD/TOKEN bị bỏ khỏi môi trường con và chặn đọc .env: **17/17 PASS**. Không sửa hoặc xóa .env trên đĩa.

Integration cần MySQL local, cấu hình JWT/DB và mật khẩu demo runtime, Edge, Playwright 1.63.0 ở thư mục tạm như suite cũ, model E5/cache và cổng 5173 trống. README ghi các bước npm ci và cài browser dependency riêng nếu thiếu. Không cài dependency mới trong GĐ6.3; không xóa cache.

**NOT VERIFIED ON CLEAN MACHINE.** Chưa chạy npm ci ở bản clone sạch, chưa CI. Không tuyên bố “reproducible from npm ci” khi chưa kiểm. Hạn chế đường dẫn Playwright/Edge và model download lần đầu còn tồn tại. **MITIGATED** nhờ script và hướng dẫn rõ hơn.

## 14. P2-04 trước fix

Model cũ UPDATE role/status trực tiếp rồi đọc lại user; không kiểm ADMIN ACTIVE còn lại. Test model với database giả lập một ADMIN cho thấy cả self-demote và INACTIVE làm số ADMIN hoạt động về 0. Không tái hiện bằng cách khóa tài khoản gốc.

## 15. Phân tích P2-04

Đếm ADMIN bằng SELECT thường rồi UPDATE có thể race: hai request cùng thấy người kia còn ACTIVE. Kiểm tra và UPDATE cần cùng transaction, cùng thứ tự khóa. Locking read giữ khóa đến commit/rollback theo [MySQL: Locking Reads](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html).

Quy mô users demo nhỏ nên chọn khóa các dòng users theo id trong thao tác đổi role/status. Đây là đánh đổi đơn giản: các cập nhật này được tuần tự hóa, chưa tối ưu cho tập user lớn; không khóa phân tán hoặc thêm bảng.

## 16. Thay đổi P2-04

updateRole/updateStatus dùng chung updateAccess nội bộ: beginTransaction → SELECT các trường user an toàn ORDER BY id FOR UPDATE → kiểm trạng thái sau thay đổi → UPDATE → commit. Nếu target là ADMIN ACTIVE cuối và thay đổi làm mất vai trò/trạng thái đó, rollback và trả HTTP 409 với thông báo rõ.

Nếu có ADMIN ACTIVE khác thì cho phép theo quyền cũ. ADMIN INACTIVE không được tính. Không đổi role names, controller validation hoặc route RBAC. Error middleware chỉ bổ sung xử lý lỗi nghiệp vụ user an toàn; không lộ SQL/stack/password.

## 17. Kết quả P2-04

Test model/mock xác nhận chặn cuối, ADMIN INACTIVE khác không được tính, thao tác hợp lệ/no-op/ID thiếu và concurrency.

API thật gửi self-demote/INACTIVE tới ADMIN gốc duy nhất đều nhận **409**, snapshot không đổi. EMPLOYEE/IT bị **403**, thiếu token **401**. Với hai ADMIN tạm, self-target và other-target được phép khi còn ADMIN khác; token cũ mất quyền khi đổi role và bị 401 khi INACTIVE.

Ba ca race role/role, status/status, role/status đều **1 thành công + 1 LAST_ACTIVE_ADMIN**, còn một ADMIN trong tập fixture. Ca lỗi sau UPDATE rollback hoàn toàn.

**Phạm vi race:** dùng model sản phẩm, connection/transaction/row lock/UPDATE MySQL thật; adapter test giới hạn SELECT vào hai ID ADMIN tạm. ADMIN gốc được giữ nguyên. Đây là kiểm chứng model/MySQL trên tập fixture cô lập, không phải hai HTTP request làm hệ thống thật mất ADMIN. API/RBAC được kiểm riêng. **FIXED**, không thay dữ liệu quản trị gốc.

## 18. P2-05 trước fix

Backend thực tế đếm [...title].length sau trim; HTML maxLength=255 lại tính UTF-16. 255 emoji có 255 code point nhưng 510 UTF-16, nên UI giới hạn sớm. GĐ6.2 đã tái hiện bằng keyboard thật; PRE_FIX GĐ6.3 đối chiếu lại implementation và mẫu Unicode.

## 19. Phân tích P2-05

Giữ backend là nguồn xác thực cuối cùng, giới hạn 255 code point. Không thay sang grapheme cluster hoặc NFC hóa title vì sẽ đổi quy tắc hiện tại. Ví dụ dấu kết hợp có thể là hai code point dù nhìn như một ký tự.

## 20. Thay đổi P2-05

Bỏ HTML maxLength, kiểm [...body.title].length > 255 trước request và hiển thị bộ đếm sau trim cùng quy tắc backend. Dùng chung nhánh save cho tạo/sửa. Không cắt im lặng nội dung người dùng nhập, không thay giới hạn 255 hoặc schema.

## 21. Kết quả P2-05

**10/10 ca browser/API PASS**: ASCII, tiếng Việt có dấu, emoji, surrogate pair ở biên 255 được UI gửi và API lưu đúng; 256 bị UI chặn trước POST và API trực tiếp trả 400. Combining marks quá biên cũng bị cả hai chặn. Edit title 255 emoji có khoảng trắng đầu/cuối lưu đúng sau trim. Các bài test đều được cleanup. **FIXED**.

## 22. Post-fix RAG verification

| Ca | HISTORICAL RESULT giữ nguyên | POST-FIX RESULT |
| --- | --- | --- |
| B01 | Groundedness PARTIAL | Replay vẫn qua validator; prompt/fixture an toàn PASS, chưa chứng minh live |
| C03 | Insufficient-context FAIL | Replay vẫn qua validator; yêu cầu làm rõ mạnh hơn, chưa chứng minh live |
| A03 | 502 do evidence dài | Replay validator và API 200, nguồn đúng, excerpt bounded |
| C01 | 502 do length, câu hỏi còn mơ hồ | Hết lỗi length; giới hạn ngữ nghĩa còn, không chấm thành PASS chất lượng |

API replay dùng JWT/MySQL thật với context lịch sử và generation giả lập; không gọi E5 ở chính bốn replay này. E2E chạy lại riêng với retrieval/context/E5 thật và provider mock. **Gemini thật: 0 request.** Không chạy benchmark 24 câu hoặc thay số liệu GĐ5.

## 23. Regression

Lượt integration hoàn chỉnh: **2026-10-03T17:38:04.677Z → 2026-10-03T17:39:22.223Z**, exit 0.

- Logic GĐ6.3: **17/17 PASS**.
- Integration riêng GĐ6.3: **24/24 PASS** (10 ADMIN/API/race, 10 Unicode, 4 RAG replay HTTP).
- E2E: **10/10 flow, 28/28 bước PASS**.
- Responsive: **8/8 PASS**.
- Regression: **206/206 PASS**, không cộng số này với E2E thành một metric.

| Suite regression | PASS |
| --- | --- |
| Auth/JWT/RBAC/Users fixture tạm | 14/14 |
| Ticket API | 30/30 |
| KB API | 30/30 |
| GĐ5.2 logic | 8/8 |
| GĐ5.3 logic | 17/17 |
| GĐ5.4 logic | 16/16 |
| GĐ5.4 API mock | 7/7 |
| Browser Auth | 7/7 |
| Browser Ticket | 5/5 |
| Browser KB | 39/39 |
| Browser RAG --mock-only | 33/33 |

Runner integration dùng lại GĐ6.2 qua bản điều chỉnh **trong bộ nhớ**: bỏ riêng reviewP2 vốn khẳng định bug cũ còn tồn tại, thay bằng test GĐ6.3; đưa JSON/ảnh vào cache ignored; so source với snapshot đầu lượt thay vì HEAD chưa có fix. **10 flow nghiệp vụ/28 bước và các suite regression không bị đổi.** Không sửa runner hoặc báo cáo GĐ6.2 trên đĩa. JSON ghi checksum source và bản thực thi, mô tả rõ adaptation.

Ảnh E2E phát sinh chỉ dùng trong cache ignored, không bổ sung screenshot vào commit; bằng chứng chính GĐ6.3 là test/assertion và JSON. Các artifact lịch sử do suite cũ ghi được phục hồi nguyên byte như wrapper GĐ6.2; đã đối chiếu tất cả docs/schema tracked.

## 24. Frontend build

**PASS** bằng node node_modules/vite/bin/vite.js build trong frontend. Bundle được rà secret; dist không đưa vào Git. Không cài thêm package hoặc đổi dependency để làm build PASS.

## 25. Database sau

| Bảng/trạng thái | Trước | Sau |
| --- | --- | --- |
| users | 3 | 3 |
| tickets | 3 | 3 |
| ticket_history | 17 | 17 |
| knowledge_articles | 8 | 8 |
| KB PUBLISHED | 8 | 8 |

So sánh đầy đủ trường/bản ghi trong bộ nhớ và fingerprint tổng đều khớp; cleanup PASS, **0 fixture còn sót**. Không chỉ đếm row. Ba user gốc, ba Ticket, 17 history và tám KB giữ nguyên; AUTO_INCREMENT có tiến do test và không reset. ID/code fixture ở JSON, không dump dữ liệu nhạy cảm.

## 26. Security

Đã rà file thay đổi, bundle frontend và đường dẫn Git hiện tại: không có .env thật, API key, JWT, password/hash/DB credentials trong phạm vi commit. Đối chiếu secret runtime trong bộ nhớ và pattern, không in giá trị. Không commit cache, ảnh cache, dist hoặc node_modules.

Lỗi runner chỉ lưu loại lỗi/bước test, không serialize login response, token, password hoặc snapshot DB. Không sửa GEMINI_MODEL hay key trong .env. Tiến trình regression dùng sentinel mock riêng, không gọi provider thật. Review phạm vi này không thay cho pentest/CVE hoặc chứng nhận production.

## 27. Các vấn đề còn lại

P0=0, P1=0 mới trong phạm vi kiểm thử. P2 chưa đóng hoàn toàn: **2** (P2-01 và P2-03, đều MITIGATED). P2 FIXED: **3**. Không phát hiện lỗi nghiệp vụ mới.

P3 giữ nguyên **4 nhóm**: quy mô/chất lượng retrieval; bảo vệ khi triển khai; UX/chức năng mở rộng; đánh giá độc lập. Không triển khai các mục đó trong GĐ6.3.

C01 replay vẫn có cách hiểu câu hỏi thiếu chắc chắn; literal evidence không chứng minh answer semantic-grounded. Chưa kiểm máy sạch/CI, chưa đánh giá model live sau prompt. Khóa toàn bộ users khi đổi role/status phù hợp demo nhỏ nhưng cần đánh giá lại nếu mở rộng quy mô.

## 28. Đề xuất bước tiếp theo

Có cơ sở chuyển sang bước hoàn thiện/demo tiếp theo sau khi người dùng xác nhận phạm vi GĐ6.4. Khi demo cần phân biệt tra cứu RAG có giới hạn với Ticket do người dùng chủ động gửi; công bố hai P2 còn lại. Nếu muốn khép P2-01/P2-03, cần kế hoạch đánh giá live/độc lập và môi trường sạch riêng được duyệt. Không tự chạy thêm API thật hoặc mở rộng chức năng.

## 29. Kết luận

Đã sửa tối thiểu ba P2 và giảm rủi ro hai P2, kiểm thử mới và regression PASS, dữ liệu/historical evidence được bảo toàn, 0 Gemini thật. README chỉ bổ sung cách chạy/prerequisite; số liệu GĐ5/6.1/6.2 không bị viết lại.

Commit theo yêu cầu: **fix: harden system before final demo**. Hash và trạng thái remote báo sau push, tránh tự tham chiếu commit trong chính tài liệu. **Dừng sau GĐ6.3; không bắt đầu GĐ6.4.**
