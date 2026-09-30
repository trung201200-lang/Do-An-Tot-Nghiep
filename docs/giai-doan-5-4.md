# Giai đoạn 5.4 – RAG Generation với Gemini

## 1. Mục tiêu và trạng thái

Hoàn thiện backend RAG và thực nghiệm generation trên đúng 24 câu của GĐ5.1/5.3. Lượt chính bắt đầu 2026-09-30T08:59:39.263Z, chạy đủ 24 câu. Có lỗi chất lượng/định dạng được giữ nguyên trong báo cáo; không coi hoàn tất lượt chạy là 24/24 câu PASS. Không thay schema, corpus, frontend, embedding, thuật toán retrieval hoặc câu hỏi/nhãn/split.

## 2. Kiến trúc

Question → validation → query embedding local → cosine/ranking article → threshold → context → system instruction + JSON dữ liệu → Gemini → kiểm tra JSON/evidence → answer + sources từ backend.

Các module trong backend/src/rag/: generationConfig, generationContext, generationPrompt, geminiClient, generationOutput, generationSafety, generationService. Route riêng backend/src/routes/ragRoutes.js được đăng ký trong app.js. Index/corpus cache trong bộ nhớ, kiểm tra hash tập bài PUBLISHED ở mỗi câu, dựng lại nếu thay đổi; chỉ đọc KB. Kiểm tra status/hash nguồn trước và sau generation, nguồn bị sửa/ẩn trả lỗi STALE_SOURCE. Một request generation đang chạy thì request RAG khác nhận 429; chưa có hàng đợi phân tán.

## 3. Model và SDK thực tế

Model thực nghiệm **gemini-3.5-flash-lite**, được người dùng cho phép thay gemini-2.5-flash. Một request generateContent tối thiểu kiểm tra model mới đã HTTP 200 và có text trước khi thực nghiệm. Không dùng kết quả model 2.5 để báo cáo cho model 3.5.

Dùng SDK Node.js chính thức **@google/genai 2.24.0**, khóa phiên bản; Node hiện tại 22.17.1. Các dependency cũ giữ nguyên phiên bản trong lockfile. SDK gửi systemInstruction riêng, responseMimeType=application/json, responseJsonSchema, maxOutputTokens=1536, timeout=30000 ms, retryOptions.attempts=1 (một lần gọi, không retry tự động); không override temperature/thinking. Model tập trung ở generationConfig; cấu hình env khác model được phê duyệt bị từ chối, không tự chuyển model.

Tài liệu chính thức đã đối chiếu: [SDK Google Gen AI](https://ai.google.dev/gemini-api/docs/libraries), [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [structured output](https://ai.google.dev/gemini-api/docs/structured-output), [retry attempts](https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpRetryOptions.html). Thông tin phiên bản được kiểm tra tại thời điểm triển khai, không giả định tồn tại vĩnh viễn.

## 4. Quản lý key và bảo mật

Key chỉ được runtime nạp từ backend/.env, đã ignore; .env.example để GEMINI_API_KEY trống. Không in biến, raw lỗi SDK, credential, JWT hoặc password. Key không gửi vào prompt hay frontend; SDK dùng key chỉ để xác thực với Google. Prompt chỉ gồm câu hỏi và tối đa ba bài KB công khai nội bộ PUBLISHED, không đọc users/password/tickets để gửi đi.

ensureNoSecrets chặn giá trị secret runtime đã biết (dài ít nhất 8 ký tự), pattern key Google/JWT trong prompt/output/report. Đây không phải bộ DLP tổng quát: không nhận biết mọi bí mật tùy ý do người dùng tự nhập. Lỗi HTTP chỉ gồm code/message cố định; diagnostic của output lỗi chỉ dành cho báo cáo thực nghiệm sau rà soát secret, không trả HTTP. Kiểm tra trích dẫn không chứng minh toàn bộ answer đúng về ngữ nghĩa.

## 5. Retrieval → context

Giữ Xenova/multilingual-e5-small (Transformers.js 4.3.0, CPU q8, 384 chiều), revision 761b726dd34fb83930e26aab4e9ac3899aa1fa78; prefix query/passage theo code GĐ5.2/5.3 (document dùng passage:). Corpus 8 bài PUBLISHED → 24 chunks. Cosine và article score=max chunk similarity giữ nguyên.

Lấy Top-3 article, từng article phải đạt threshold. Gửi nội dung toàn bài đã chuẩn hóa, code/title; khử trùng theo article, tổng phần nội dung tối đa 12000 code point; bài không vừa ngân sách bị bỏ qua, không cắt nửa câu. Lựa chọn toàn bài phù hợp corpus nhỏ, tránh lặp overlap và mất bước xử lý. Giới hạn này là ngân sách nội dung, không bao gồm JSON/title/instruction; chưa tối ưu theo tokenizer Gemini.

## 6. Prompt grounding

INSTRUCTIONS nằm trong systemInstruction; QUESTION/CONTEXT được JSON.stringify vào user message. Yêu cầu tiếng Việt, chỉ dựa context, không bịa chính sách, bước sửa, mã lỗi hay mã KB; không khẳng định đã khắc phục. Dữ liệu câu hỏi/KB không có quyền đổi instruction. Câu mơ hồ hoặc cần chi tiết ngoài KB phải answered=false.

Unit test kiểm tra ranh giới instruction/dữ liệu và chuỗi yêu cầu bỏ qua context. Đây là kiểm tra cấu trúc với mock, không phải chứng minh model chống mọi prompt injection. Thực nghiệm C01/C03 cho thấy instruction chưa đủ bảo đảm nhận biết thiếu thông tin.

## 7. Threshold và fallback

Ngưỡng khóa **0.8504602347669256** từ GĐ5.3, không hiệu chỉnh trên TEST GĐ5.4. Dưới ngưỡng không gọi Gemini. Fallback chuẩn: “Kho kiến thức hiện chưa có đủ thông tin để trả lời vấn đề này. Bạn có thể gửi yêu cầu hỗ trợ cho bộ phận IT.” Response answered=false, sources=[]. Gemini tự nhận thiếu context cũng dùng fallback này. Lỗi API/định dạng không bị biến thành fallback giả thành công.

## 8. Sources và API

Gemini chỉ trả answered, answer, evidence (trích nguyên văn 20–500 ký tự). Backend đối chiếu evidence với context, rồi lấy code/title/score từ retrieval; không nhận sources do Gemini khai báo, chặn mã KB trong answer. Ít nhất một evidence đúng mới trả answered=true. Nguồn khớp trích dẫn không bảo đảm từng câu trong answer được trích dẫn hỗ trợ; B01 là ví dụ.

POST /api/rag/ask dùng JWT/RBAC hiện tại, cho EMPLOYEE/IT/ADMIN ACTIVE. Body chỉ question, trim/chuẩn hóa NFC, giới hạn 1000 code point và 512 token embedding. Ví dụ:

~~~json
{"question":"Không kết nối được Wi-Fi thì làm gì?"}
~~~

Response thành công/fallback chỉ answered, answer, sources. Lỗi validation 400; auth 401/403; bận 429; invalid output/evidence/empty/incomplete/network 502; key/model/quota/nguồn thay đổi 503; timeout được nhận diện 504. Không trả stack, config hoặc raw lỗi provider. Test HTTP dùng JWT/MySQL thật và generation mock; thực nghiệm 24 câu gọi service với retrieval/Gemini thật, chưa chạy lại 24 câu qua HTTP để tránh gọi API trùng.

## 9. Thiết kế thực nghiệm

Giữ nguyên 8 DIRECT, 8 PARAPHRASE, 4 PARTIAL, 4 OUT_OF_KB. Chạy 18 lần Gemini trong lượt chính; 6 câu bị threshold chặn. Không tự retry để chọn output đẹp. Có 1 lượt trước dừng ở A03, đã lưu 2 câu hoàn tất trong previousAttempts cùng lỗi/failedQuestionId; lượt đó gọi 3 lần, không gộp vào chỉ số lượt chính. Request xác minh model là 1 lần riêng. Lượt chính giữ raw ứng viên A03/C01 bị từ chối để kiểm tra, không sửa chúng thành answer hợp lệ.

Tệp stage5-4-results.json chứa câu hỏi/nhãn gốc, ranking, context/hash, answer/sources hoặc error, evidence, token usage, timing, đánh giá từng câu, test/regression và kiểm tra dữ liệu. Lượt chạy lại luôn cần manual evaluation mới; nhãn hiện tại chỉ áp dụng đúng output đã lưu.

## 10. Kết quả 24 câu

Answer rate: **14/24 = 58,33%**. Fallback **8/24 = 33,33%**, gồm 6 do threshold và 2 thiếu context. Lỗi generation validation **2/24 = 8,33%**. Trong 18 lần gọi Gemini: 14 answer, 2 fallback, 2 lỗi evidence. Không loại hai lỗi khỏi mẫu số để tăng tỉ lệ.

G=groundedness; S=source correctness; F=fallback xét khả năng trả lời; I=nhận biết thiếu context của PARTIAL. N_A là không áp dụng, không phải PASS. Các nhãn là MANUAL EVALUATION của Codex, không phải người đánh giá độc lập.

| Câu | Gọi Gemini | Kết quả | G | S | F | I | Lý do |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A01 | Có | Answer | PASS | PASS | N_A | N_A | Các bước bật Wi-Fi, tắt chế độ máy bay và tìm vị trí có sóng đều có trong KB-000008; câu trả lời chỉ nêu bước đầu, không chẩn đoán chắc chắn. |
| A02 | Có | Answer | PASS | PASS | N_A | N_A | Các bước kiểm tra máy in, hủy lệnh của chính mình và gửi Ticket được KB-000009 hỗ trợ. Bản tóm tắt bỏ nhắc lưu tài liệu trước khi mở lại ứng dụng; chưa đánh giá độ đầy đủ như một metric riêng. |
| A03 | Có | Lỗi evidence | N_A | N_A | N_A | N_A | Không trả answer cho người dùng: evidence đầu dài 537 ký tự, vượt giới hạn 500 dù trích đúng nguồn. Nội dung ứng viên về khôi phục mật khẩu có căn cứ KB-000010; lỗi hợp đồng đầu ra, không được tính là trả lời thành công. |
| A04 | Có | Answer | PASS | PASS | N_A | N_A | Kiểm tra kết nối, thông báo trả lại, địa chỉ nhận, thư mục, dung lượng và giới hạn đính kèm đều thuộc KB-000011. |
| A05 | Có | Answer | PASS | PASS | N_A | N_A | Lưu công việc, đóng ứng dụng, theo dõi tài nguyên, kiểm tra dung lượng và thông thoáng máy đều thuộc KB-000012; không suy diễn máy nhiễm mã độc. |
| A06 | Có | Answer | PASS | PASS | N_A | N_A | Kiểm tra mạng, đường dẫn, tài khoản và xin quyền phù hợp KB-000013; không đề nghị mượn tài khoản hoặc thay quyền trái phép. |
| A07 | Có | Answer | PASS | PASS | N_A | N_A | Các bước kiểm tra nút tắt tiếng, chọn microphone, quyền ứng dụng, đóng ứng dụng khác và thử thiết bị đều thuộc KB-000014. Bản tóm tắt bỏ nhắc lưu công việc và báo người họp trước khi thử. |
| A08 | Có | Answer | PASS | PASS | N_A | N_A | Địa chỉ đáng tin cậy, kết nối, lưu nội dung, đổi trình duyệt được phép và dừng khi có cảnh báo bảo mật đều thuộc KB-000015. |
| B01 | Có | Answer | PARTIAL | PASS | N_A | N_A | Các bước xử lý có trong KB-000008 nhưng câu mở đầu khẳng định do Wi-Fi bị tắt. Dấu gạch trên biểu tượng chưa xác nhận nguyên nhân; groundedness PARTIAL và có khẳng định chẩn đoán thiếu căn cứ. |
| B02 | Có | Answer | PASS | PASS | N_A | N_A | Hàng đợi, nguồn, khay giấy, đúng máy in và kết nối được KB-000009 hỗ trợ; không bịa mã lỗi hoặc sửa phần cứng. |
| B03 | Không | Fallback | N_A | N_A | FAIL | N_A | Top-1 đúng KB-000010 nhưng 0.850448 thấp hơn ngưỡng khóa 0.8504602347669256. Fallback tuân thủ gate, song là false negative khi xét khả năng trả lời từ KB; không gọi Gemini. |
| B04 | Có | Answer | PASS | PASS | N_A | N_A | Các bước kiểm tra thư bị giữ ở hộp đi được KB-000011 hỗ trợ; không suy diễn cấu hình DNS. |
| B05 | Có | Answer | PASS | PASS | N_A | N_A | Retrieval Top-1 sai chủ đề máy in, nguồn máy chậm KB-000012 ở rank 2 vẫn vượt ngưỡng và vào context. Answer/evidence chọn đúng KB-000012, không đưa máy in vào sources. |
| B06 | Có | Answer | PASS | PASS | N_A | N_A | Xác nhận đường dẫn, tài khoản và gửi yêu cầu IT cấp quyền có trong KB-000013; không coi việc vào được Internet là có quyền thư mục. |
| B07 | Không | Fallback | N_A | N_A | FAIL | N_A | Top-1 đúng KB-000014 nhưng 0.839633 dưới ngưỡng. Fallback an toàn theo gate nhưng false negative về answerability; không gọi Gemini. |
| B08 | Có | Answer | PASS | PASS | N_A | N_A | Kiểm tra địa chỉ, kết nối, trình duyệt được phép và gửi Ticket nếu kéo dài đều có trong KB-000015. |
| C01 | Có | Lỗi evidence | N_A | N_A | N_A | FAIL | Không có response hợp lệ: evidence đầu dài 679 ký tự nên bị chặn. Ứng viên tự hiểu tài nguyên là thư mục mạng; câu hỏi chưa xác định loại tài nguyên. Không tính lỗi 502 là fallback đúng; ứng viên thất bại ở việc nhận biết cần làm rõ. |
| C02 | Có | Fallback | N_A | N_A | PASS | PASS | KB máy in không mô tả mã E42 hoặc linh kiện thay thế. Gemini trả answered=false; backend trả fallback và sources rỗng, phù hợp thiếu context. |
| C03 | Có | Answer | PASS | PASS | N_A | FAIL | Các bước chung có trong KB-000015, nên groundedness PASS theo nội dung. Tuy nhiên trang làm việc chưa xác định, lỗi đăng nhập chưa rõ; Gemini không yêu cầu làm rõ hoặc từ chối. Insufficient-context FAIL, không đánh đồng trùng chủ đề với đủ thông tin. |
| C04 | Có | Fallback | N_A | N_A | PASS | PASS | KB email không có bản ghi DNS cụ thể. Gemini từ chối, backend trả fallback và không đưa nguồn giả. |
| D01 | Không | Fallback | N_A | N_A | PASS | N_A | Ngoài KB: chính sách ngày phép. Dưới ngưỡng, không gọi Gemini, answered=false và sources rỗng. |
| D02 | Không | Fallback | N_A | N_A | PASS | N_A | Ngoài KB: cấu hình BGP Cisco. Dưới ngưỡng, không gọi Gemini, answered=false và sources rỗng. |
| D03 | Không | Fallback | N_A | N_A | PASS | N_A | Ngoài KB: chính sách hoàn tiền công tác. Dưới ngưỡng, không gọi Gemini, answered=false và sources rỗng. |
| D04 | Không | Fallback | N_A | N_A | PASS | N_A | Ngoài KB: phục hồi PostgreSQL WAL. Dưới ngưỡng, không gọi Gemini, answered=false và sources rỗng. |

## 11. DIRECT

7 answer, 0 fallback, 1 lỗi (A03). Bảy answer có nội dung chính được nguồn hỗ trợ. Một số tóm tắt bỏ cảnh báo/điều kiện phụ; rubric groundedness không đo độ đầy đủ. A03 có ứng viên đúng nguồn nhưng evidence đầu dài 537 ký tự, vượt hợp đồng 500; backend trả lỗi, không có answer đến người dùng. Đối chiếu offline xác nhận evidence thực sự có trong context, không phải nguồn giả.

## 12. PARAPHRASE

6 answer, 2 false-negative fallback (B03/B07). B01 PARTIAL do chẩn đoán nguyên nhân quá chắc; 5 answer còn lại PASS về nội dung chính. B05 tận dụng nguồn rank 2. Không suy ra generation khắc phục được mọi lỗi retrieval từ một trường hợp này.

## 13. PARTIAL

C02/C04 từ chối đúng vì KB không có linh kiện E42 hoặc cấu hình DNS. C03 trả hướng dẫn chung mà không làm rõ trang/lỗi đăng nhập, nên insufficient-context FAIL dù nội dung thuộc nguồn. C01 tự đồng nhất tài nguyên với thư mục mạng; ứng viên bị chặn vì evidence 679 ký tự. Không coi việc bị chặn do độ dài là model nhận biết thiếu context. Khả năng xử lý thiếu thông tin đạt 2/4 theo rubric; 2 trường hợp chưa đạt được giữ nguyên.

## 14. OUT_OF_KB

D01–D04 đều dưới threshold, không gọi Gemini, fallback với sources rỗng. An toàn ngoài KB 4/4 trên bộ câu hiện tại; không đủ kết luận trên mọi câu ngoài miền.

## 15. B05

Top-1 KB-000009 (máy in) sai, score khoảng 0.854963. KB-000012 (máy chậm) ở rank 2, score 0.8528305462270559 vẫn vượt ngưỡng nên vào context. Gemini dùng evidence máy chậm; sources chỉ KB-000012. Câu trả lời về lưu công việc, đóng ứng dụng, tài nguyên, dung lượng và tản nhiệt phù hợp nguồn đúng.

## 16. B03

Top-1 KB-000010 đúng, score khoảng 0.850448 nhưng dưới 0.8504602347669256. Giữ fallback và không gọi Gemini. Gate PASS theo thiết kế, fallback FAIL xét khả năng trả lời từ KB. Không giảm ngưỡng trên TEST để sửa false negative.

## 17. B07

Top-1 KB-000014 đúng, score khoảng 0.839633 dưới ngưỡng. Vẫn từ chối nhầm câu về microphone; generation không có cơ hội sửa. Không sửa câu hỏi hoặc nới threshold.

## 18. D01–D04

D01 ngày phép, D02 BGP Cisco, D03 hoàn tiền công tác, D04 PostgreSQL WAL đều ngoài tám bài KB. Đối chiếu offline 24/24 top-1 code/score với GĐ5.3, cả hai output bị lỗi; quyết định gọi Gemini tương ứng accepted của GĐ5.3. Câu hỏi, expected và split giữ nguyên.

## 19. MANUAL EVALUATION: groundedness và nguồn

Codex đọc từng answer và context đã lưu. PASS nếu nội dung chính có căn cứ, PARTIAL nếu có chi tiết chưa được hỗ trợ, FAIL nếu thông tin quan trọng ngoài/mâu thuẫn nguồn. Không có answer thì N_A. Kết quả trên **14 answer trả về**: **13 PASS, 1 PARTIAL (B01), 0 FAIL**; không tính fallback/lỗi là grounded answer. Đây là nhận định định tính, chưa có người chấm độc lập hoặc mức đồng thuận giữa người chấm.

Source correctness **14/14 PASS**: metadata đúng context/retrieval và bài hỗ trợ nội dung chính. Mọi evidence của answer trả về khớp nguyên văn sau chuẩn hóa. B01 vẫn có khẳng định quá mức, nên source correctness không thay thế groundedness. Fallback xét khả năng trả lời: 6/8 đúng, 2/8 false negative; mọi threshold gate hoạt động đúng thuật toán.

## 20. Hallucination và lỗi đầu ra

B01 khẳng định “do Wi-Fi bị tắt” khi chưa đủ chứng cứ: một khẳng định thiếu căn cứ trong answer trả về. C01 ứng viên giả định tài nguyên là thư mục mạng, chưa được trả cho người dùng. C03 không bịa bước ngoài KB nhưng xử lý câu mơ hồ chưa đạt. Không báo hallucination bằng 0 chỉ vì evidence/source khớp.

A03/C01 bị chặn bởi giới hạn evidence 500; trích dẫn dài lần lượt 537/679. Lỗi thuộc tuân thủ hợp đồng của model, bộ kiểm tra hoạt động như thiết kế. Không nới validator sau khi xem TEST để biến lỗi thành PASS. Runner đã được sửa để giữ diagnostic và tiếp tục các câu còn lại khi output sai; API/key/model/quota/network lỗi vẫn dừng, không chuyển model. Chưa thể tuyên bố mọi answer đủ căn cứ về ngữ nghĩa.

## 21. Latency

Đơn vị ms; trung bình 24 câu gồm cả fallback, không tính khởi tạo embedding/corpus vào từng câu:

| Thành phần | Trung bình | Min | Max |
| --- | ---: | ---: | ---: |
| Query embedding local | 5,853 | 4,500 | 7,968 |
| Retrieval local | 1,384 | 0,522 | 4,878 |
| Context + kiểm tra nguồn trước gọi | 2,162 | 0 | 5,871 |
| Gemini (6 câu không gọi = 0) | 1275,564 | 0 | 2279,136 |
| Total bên trong answerQuestion | 1287,920 | 6,472 | 2292,554 |
| Gemini chỉ 18 câu thực sự gọi | 1700,752 | 1028,038 | 2279,136 |

Khởi tạo embedder và corpus lần đầu 2577,416 ms, báo riêng. Total là thời gian xử lý bên trong answerQuestion, gồm validation/output và kiểm tra nguồn sau generation; không phải HTTP end-to-end, không cộng prepare kiểm tra cache/DB mỗi request. prepare được trace riêng ở các câu không lỗi. Context có truy vấn MySQL local; Gemini gồm thời gian mạng/dịch vụ, không so sánh như cùng loại tác vụ với retrieval CPU. Chỉ một lượt trên máy local, không phải benchmark tải cao.

## 22. Test, regression, dữ liệu và security review

- GĐ5.4: 16 logic tests mock Gemini + 7 API tests JWT/MySQL thật, mock generation = **23/23 PASS**.
- GĐ5.3: **21/21 PASS** (17 test đánh số và 4 bổ sung), retrieval/model thật và fixtures.
- GĐ5.2: **27/27 PASS** (19 thực nghiệm/validation + 8 logic).
- Auth/JWT/RBAC/users **23/23**, Ticket **30/30**, KB **30/30 PASS**; dọn bản ghi test, khôi phục báo cáo giai đoạn trước.
- Kiểm tra toàn bộ snapshot dữ liệu trước/sau experiment và regression bằng deep equality, không chỉ đếm. users=3, tickets=3, ticket_history=17, knowledge_articles=8; cả 8 vẫn PUBLISHED. Không đổi schema hoặc reset AUTO_INCREMENT; sequence có thể tăng khi test tạo rồi dọn bản ghi tạm.
- Rà soát nguồn PUBLISHED, SQL tham số, JWT/RBAC, giới hạn input/context/output, lỗi không lộ raw provider/stack, sources do backend xác định và secret scan trước ghi report/commit. Dependency mới qua npm audit ở thời điểm cài đặt: 0 vulnerabilities; không phải cam kết an toàn tuyệt đối.

Các test cấu trúc/injection sử dụng mock, không chứng minh model chống mọi tấn công. Không thêm frontend nên không chạy lại bộ browser trong GĐ5.4; kết quả browser GĐ4.5 thuộc lần chạy trước. Báo cáo machine-readable lưu tên từng test và kết quả thực tế. Không gọi Gemini trong regression cũ.

## 23. Cách chạy, file thay đổi và cải tiến đề xuất

Trong backend, cấu hình local theo .env.example rồi chạy npm ci nếu cần. npm run test:stage5-4:logic chạy logic, node tests/stage5-4-api.cjs chạy API mock generation, npm run test:stage5-4 chạy experiment thật và regression. Cần key/model đã được phê duyệt, tài khoản demo hiện có và MySQL local; không chạy đồng thời người sửa dữ liệu. Không cần seed lại. Runner lưu previousAttempts, đánh giá lượt mới PENDING; exit 0 là hoàn tất chạy, không phải mọi output PASS.

File sửa: README.md, backend/.env.example, backend/package.json, backend/package-lock.json, backend/src/app.js.

File mới: 7 module generationConfig.js, generationContext.js, generationPrompt.js, geminiClient.js, generationOutput.js, generationSafety.js, generationService.js trong backend/src/rag/; backend/src/routes/ragRoutes.js; backend/tests/stage5-4-logic.cjs, stage5-4-api.cjs, stage5-4-generation.cjs; docs/giai-doan-5-4.md, docs/stage5-4-results.json.

Đề xuất cho một thực nghiệm mới có phê duyệt: ràng buộc độ dài evidence ở JSON schema rồi đo lại trên DEV; kiểm tra từng khẳng định với trích dẫn; đánh giá làm rõ câu mơ hồ; nhiều lần chạy và người chấm độc lập; adversarial prompt injection; ngân sách token Gemini và giới hạn quota theo user. Không triển khai các đề xuất này trong GĐ5.4, không hiệu chỉnh theo TEST hiện tại.

## 24. Kết luận và điểm dừng

Đã có backend RAG dùng model thật, experiment đủ 24 câu và regression qua; dữ liệu nghiệp vụ giữ nguyên. B05 cho thấy context Top-3 giúp vượt lỗi Top-1. B03/B07 vẫn false negative; A03/C01 lỗi hợp đồng evidence; B01 có khẳng định quá chắc và C03 thiếu làm rõ. Hệ thống ở mức thử nghiệm, không tuyên bố mọi câu trả lời đúng hoặc sẵn sàng production. Dừng sau GĐ5.4; không bắt đầu GĐ5.5.
