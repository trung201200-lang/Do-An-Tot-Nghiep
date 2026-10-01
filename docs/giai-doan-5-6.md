# Giai đoạn 5.6 – Tổng hợp, đánh giá và hoàn thiện phần RAG

## 1. Mục tiêu

Tổng hợp nghiên cứu, code, thực nghiệm và giao diện GĐ5.1–5.5 thành tài liệu dùng cho đồ án. Phân biệt kết quả truy xuất với chất lượng sinh câu trả lời, giữ cả trường hợp chưa đạt; xác minh hệ thống hiện tại bằng kiểm thử cuối. Nguồn máy đọc: [stage5-6-results.json](stage5-6-results.json), có đường dẫn và SHA-256 của tài liệu/code đã đối chiếu.

## 2. Phạm vi

GĐ5.6 chỉ tạo báo cáo này, JSON tổng hợp, [checklist minh chứng](giai-doan-5-minh-chung.md) và cập nhật tối thiểu README. Không sửa source nghiệp vụ, test cũ, schema, corpus, câu hỏi/nhãn, thuật toán, prompt, evidence validator, threshold hoặc model. Git ban đầu: main sạch, main=origin/main tại 5f196d8ed55bdbc5b6b3783a04a06fd562709297.

Không thực nghiệm lại 24 câu để thay số liệu. Chỉ tính lại metric từ ranking/output đã lưu nhằm kiểm chứng; không chấm lại để đổi nhãn thủ công. Kiểm thử cuối dùng model local và Gemini mock, **0 request Gemini thật**. Các JSON GĐ5.2–5.5 và báo cáo cũ giữ nguyên byte sau test. Runner điều phối tạm nằm trong cache local bị ignore; commit chủ yếu là tài liệu.

## 3. Tổng quan GĐ5.1 → GĐ5.5

| Giai đoạn | Kết quả đã có | Nguồn |
| --- | --- | --- |
| 5.1 | Nghiên cứu RAG, thiết kế corpus/24 câu/DEV–TEST/rubric | [Tài liệu 5.1](giai-doan-5-1.md) |
| 5.2 | Chunking ưu tiên đoạn, embedding E5 local thật, 24 vector | [Tài liệu](giai-doan-5-2.md), [JSON](stage5-2-results.json) |
| 5.3 | Cosine, Top-K chunk/article, chọn ngưỡng trên DEV và đánh giá | [Tài liệu](giai-doan-5-3.md), [JSON](stage5-3-results.json) |
| 5.4 | Generation Gemini, evidence, JWT API, đánh giá 24 câu | [Tài liệu](giai-doan-5-4.md), [JSON](stage5-4-results.json) |
| 5.5 | React Trợ lý CNTT, nguồn/fallback/lỗi và liên kết Ticket | [Tài liệu](giai-doan-5-5.md), [JSON](stage5-5-results.json) |

Các câu “chưa triển khai” trong tài liệu giai đoạn trước là trạng thái tại thời điểm đó. Ví dụ GĐ5.1 chưa có retrieval, GĐ5.3 chưa có LLM; đó không phải mô tả trạng thái cuối. Không sửa ngược tài liệu/số liệu lịch sử để che tiến trình phát triển.

## 4. Bài toán áp dụng RAG

Người dùng mô tả sự cố CNTT bằng nhiều cách khác với tiêu đề KB. Hệ thống thử truy xuất hướng dẫn liên quan và diễn đạt câu trả lời có nguồn, cho phép chuyển sang hỗ trợ của IT khi cần. RAG không tự sửa máy, cấp quyền, đặt lại mật khẩu hoặc gửi Ticket. Tìm kiếm từ khóa truyền thống của KB vẫn tồn tại. Không có bằng chứng rằng hệ thống vượt mọi baseline trên mọi câu; mốc keyword includes nguyên câu là đối chứng đơn giản, chưa phải BM25/hybrid.

## 5. Kiến trúc cuối từ code

~~~mermaid
flowchart TD
    KB[MySQL: KB PUBLISHED] --> N[Chuẩn hóa NFC/LF]
    N --> C[Chunking 800 / overlap tối đa 120]
    C --> E[E5 local: vector 384 chiều]
    E --> RAM[Vector trong RAM]
    Q[React: câu hỏi + JWT] --> V[Auth/RBAC và validation]
    V --> QE[Query embedding E5]
    QE --> S[Cosine với toàn bộ chunk]
    RAM --> S
    S --> A[Max score mỗi article, xếp hạng rồi Top-K]
    A --> T{Đạt threshold?}
    T -->|Không| F[Fallback không gọi Gemini]
    T -->|Có| CT[Context bài PUBLISHED, kiểm hash]
    CT --> G[Gemini 3.5 Flash-Lite]
    G --> O[Kiểm JSON / evidence / nguồn hiện hành]
    O --> AN[Answer + sources hoặc fallback]
    O --> ER[Lỗi có kiểm soát nếu không hợp lệ]
    AN --> UI[React hiển thị kết quả]
    ER --> UI
    F --> UI
    UI --> TK[EMPLOYEE chủ động chuyển sang tạo Ticket khi fallback]
~~~

Chunking dành cho KB trong bước chuẩn bị index; không chunk lại câu hỏi. Code aggregate max trên **toàn bộ** ranking chunk rồi mới cắt Top-K article; không khử trùng riêng Top-K chunk. Vector RAM là cấu trúc trong tiến trình, **không phải Vector Database**. MySQL là nguồn chuẩn nghiệp vụ.

## 6. Nguồn dữ liệu

Chỉ knowledge_articles WHERE status='PUBLISHED'; không dùng Ticket/users/password làm corpus, không đưa DRAFT/ARCHIVED vào context kể cả ADMIN. Hiện 8 bài: Wi-Fi, máy in, quên mật khẩu, email, máy chậm, thư mục mạng, microphone, website nội bộ (KB-000008 đến KB-000015). Các bài là dữ liệu demo, không phải quy trình CNTT chính thức.

readPublished dùng truy vấn tham số và ORDER BY id. generationService kiểm hash tập bài ở mỗi request, dựng lại corpus nếu thay đổi; generationContext xác minh status/hash các nguồn trước và sau gọi model. Đã có làm mới theo request, chưa có re-index nền hoặc index bền vững.

## 7. Chunking

NFC, CRLF→LF, trim khoảng trắng biên, giữ tiếng Việt và phủ định/cấu hình. Chia ưu tiên paragraph, rồi line/space, bảo đảm tiến lên, không trộn bài. CHUNK_SIZE=800 Unicode code point; overlap tối đa 120, có thể ít hơn để giữ ranh giới/ngân sách. Tokenizer đếm toàn input kể cả prefix/title/special tokens; quá 512 thì chia tiếp, không cắt ngầm.

GĐ5.2: **8 bài → 24 chunks, 3 chunk/bài**; độ dài min 294, max 797, trung bình 491,17 code point. Metadata gồm article_id/code/title/status/chunk_index/span/token_count/overlap; validator kiểm coverage nguồn. Chưa so thực nghiệm nhiều chunk size hoặc chứng minh 800 là tối ưu.

## 8. Embedding

Xenova/multilingual-e5-small, model gốc intfloat/multilingual-e5-small; revision 761b726dd34fb83930e26aab4e9ac3899aa1fa78, ONNX q8 trên CPU, Transformers.js 4.3.0. Input document là passage: + title + xuống dòng + chunk; query là query: + câu hỏi. Attention-mask mean pooling, L2 normalization; vector **384 chiều**, hữu hạn, norm xấp xỉ 1. Inference local không cần API key; artifact model/tokenizer cache ngoài Git. Không đổi model ở GĐ5.6.

## 9. Vector Retrieval

Cosine = tích vô hướng chia tích hai norm. Code chia từng thành phần trước để tránh overflow; reject vector sai chiều/nonfinite/norm 0. Quét chính xác N chunk rồi sort; hòa score theo articleId/chunkIndex để tái lập. Article score là max chunk score, giữ chunk tốt nhất làm tham chiếu. K=1/3/5 trong thực nghiệm; generation dùng tối đa 3 article. Chunk-level và article-level có cùng metric tổng ở dataset này nhưng là hai định nghĩa khác nhau.

## 10. Threshold

Ngưỡng **0.8504602347669256**, chọn trên 12 câu DEV: tối đa balanced accuracy giữa IN accepted và OUT rejected; hòa ưu tiên ít false positive OUT rồi ngưỡng thấp hơn. Khóa trước TEST, không giảm sau khi thấy B03/B07. Điểm cosine không phải xác suất đúng.

retrievalConfig mặc định threshold=null cho công cụ nghiên cứu; generationConfig của API truyền ngưỡng đã khóa. Tài liệu cuối cần phân biệt hai ngữ cảnh này. 20 câu có nguồn kỳ vọng: accept 18, reject nhầm 2; OUT reject đúng 4/4. PARTIAL accepted chỉ nghĩa có ứng viên liên quan, không chứng minh đủ thông tin trả lời.

## 11. Context construction

Lấy Top-3 article rồi chỉ giữ từng bài có score đạt ngưỡng, status PUBLISHED và metadata khớp. Gửi **toàn nội dung bài đã chuẩn hóa**, không chỉ chunk đứng hạng cao; khử trùng bài. Tổng nội dung tối đa 12000 code point, bài không vừa bị bỏ qua; ngân sách chưa tính instruction/title/JSON và chưa phải giới hạn theo tokenizer Gemini. Prompt có code/title/content, không gồm dữ liệu tài khoản hay Ticket.

## 12. Gemini Generation

Model thực tế **gemini-3.5-flash-lite**, SDK **@google/genai 2.24.0**. Model này đã được người dùng phê duyệt thay mục tiêu ban đầu 2.5 Flash. Key chỉ ở backend/.env, không trong Git/browser. generateContent dùng systemInstruction riêng, JSON schema, maxOutputTokens=1536, timeout 30 giây, attempts=1, không tự retry/đổi provider/model.

System yêu cầu tiếng Việt, chỉ context, không bịa bước/chính sách/tham số và không tuyên bố đã khắc phục. QUESTION/CONTEXT là JSON dữ liệu, không có quyền ghi đè instruction. Chưa có bằng chứng chống mọi prompt injection hoặc khả năng hiểu thiếu context tuyệt đối.

## 13. Grounding/Evidence

Model trả answered, answer và evidence; backend kiểm JSON/kiểu/giới hạn, yêu cầu evidence khi answered=true. Mỗi quote phải 20–500 đơn vị theo String.length JavaScript (UTF-16), khớp literal với text nguồn sau chuẩn hóa; tối đa 8 quote, answer tối đa 8000 đơn vị theo code. Đây là kiểm chứng trích dẫn và hợp đồng đầu ra, **không phải kiểm entailment của mọi khẳng định**. Nguồn/evidence thật vẫn có thể đi cùng câu diễn đạt quá chắc như B01.

A03/C01 có quote thật nhưng dài 537/679 nên bị chặn. Không nới rule để biến lỗi thành PASS ở giai đoạn tổng kết. Không phải mọi lỗi evidence đều có nghĩa model bịa nguồn.

## 14. Sources

Code/title/score được backend lấy từ context Retrieval đã xác minh, dựa trên bài khớp evidence. Không nhận sources tùy ý từ model, không để model quyết định mã KB. Response công khai chỉ answered/answer/sources; không có article ID, raw evidence hoặc reason. UI hiển thị code/title text an toàn, không tự tạo link/nguồn và không diễn giải score như độ tin cậy.

Source correctness đo nguồn có hỗ trợ nội dung chính; khác groundedness từng khẳng định. 14/14 nguồn đúng không làm B01 trở thành grounded hoàn toàn.

## 15. Fallback

Dưới threshold → không gọi Gemini → answered=false, answer thông báo thiếu thông tin, sources=[]. Gemini chủ động báo thiếu context cũng về cùng fallback. Không có context phù hợp cũng không gọi model đoán. Lỗi provider/empty/truncated/evidence không bị đổi thành answer giả; trả lỗi 502/503/504 hoặc status phù hợp.

UI không phân biệt được threshold reject với insufficient context nội bộ vì API không cung cấp reason; tổng hợp ghi rõ giới hạn này. D01–D04 đều bị gate chặn trong bộ câu đã lưu, nhưng chưa đủ để kết luận không bao giờ trả lời sai ngoài KB.

## 16. Frontend RAG Assistant

EMPLOYEE/IT/ADMIN đăng nhập ACTIVE đều dùng Trợ lý CNTT qua POST /api/rag/ask + JWT hiện có. Input trim, không gửi rỗng, tối đa 1000 code point; backend còn giới hạn token. Enter gửi, Shift+Enter xuống dòng, tránh gửi trong IME. Loading disable và ref chống submit lặp. Answer plain text giữ dòng, nguồn code/title; fallback/lỗi rõ ràng. HTTP 401 về login; lỗi provider dùng thông báo cố định, không hiển thị raw diagnostic.

Chỉ một kết quả trong state; rời tab/logout/reload sẽ mất. Không chat memory/MySQL history. Abort fetch khi rời UI hoặc chờ quá 65 giây không bảo đảm hủy lời gọi provider đã bắt đầu. Desktop/mobile 390px đã kiểm chứng.

## 17. RAG → Ticket và thuật ngữ nghiệp vụ

**EMPLOYEE gửi yêu cầu hỗ trợ bằng cách tạo Ticket.** Route POST /api/tickets chỉ cho EMPLOYEE; user xem Ticket của mình. Nút “Tạo yêu cầu hỗ trợ” ở RAG fallback chỉ chuyển sang mục Ticket; người dùng chọn “Tạo yêu cầu”, điền form rồi tự gửi. Không AI tự tạo, không tự gửi, không thêm cơ chế escalation tự động.

IT tiếp nhận và xử lý Ticket, không xử lý Ticket đã assigned cho IT khác. ADMIN xem/quản lý và xử lý theo quyền hiện có, có thể tiếp nhận/đổi priority/trạng thái; không có quyền POST tạo Ticket chỉ vì là ADMIN. Workflow: NEW→RECEIVED→IN_PROGRESS→RESOLVED→CLOSED; RESOLVED→IN_PROGRESS để mở lại. RESOLVED bắt buộc solution; cập nhật trạng thái và history dùng transaction, khóa dòng. Priority LOW/MEDIUM/HIGH thủ công. Không đổi nghiệp vụ để phục vụ RAG.

## 18. Thiết kế thực nghiệm

24 câu cố định từ GĐ5.1. DEV: A01–A04, B05–B08, C01–C02, D01–D02; TEST: 12 câu còn lại. Dùng DEV chọn ngưỡng, TEST chỉ đánh giá sau khóa. Expected topic ánh xạ sang bài PUBLISHED thực tế; không chỉnh câu/nhãn/corpus sau thấy lỗi.

GĐ5.3 đo ranking/threshold, 3 lượt local mỗi câu sau warm-up. GĐ5.4 chạy generation thật một lượt đủ 24 câu, giữ output lỗi và lượt dừng trước đó trong previousAttempts. GĐ5.5 chỉ kiểm chứng UI với 1 Gemini call thật. GĐ5.6 tổng hợp JSON lịch sử, kiểm thử mock/local, không dùng số đo mới thay benchmark cũ.

## 19. Dataset thực nghiệm

| Thành phần | Số lượng / ý nghĩa |
| --- | --- |
| KB / PUBLISHED | 8 / 8 bài demo |
| Chunk / dimension | 24 / 384 |
| DIRECT (A) | 8 câu trực tiếp, một nguồn kỳ vọng |
| PARAPHRASE (B) | 8 câu diễn đạt lại, một nguồn kỳ vọng |
| PARTIAL (C) | 4 câu có chủ đề ứng viên nhưng thiếu chi tiết/mơ hồ |
| OUT_OF_KB (D) | 4 câu không có nguồn phù hợp |
| DEV / TEST | 12 / 12; mỗi tập 8 A/B, 2 C, 2 D |

Có cặp gần nghĩa giữa DEV/TEST, corpus nhỏ và đồng dạng. Không phải benchmark độc lập hoặc dữ liệu thực tế doanh nghiệp lớn.

## 20. Kết quả Retrieval

Nguồn: stage5-3-results.json → metrics.ALL, được GĐ5.6 tính lại trực tiếp từ topChunks/topArticles và expected để đối chiếu.

| Tập | Top-1 | Hit@3 | Hit@5 |
| --- | ---: | ---: | ---: |
| DIRECT | 8/8 = 100% | 8/8 | 8/8 |
| PARAPHRASE | 7/8 = 87,5% | 8/8 | 8/8 |
| DIRECT + PARAPHRASE | **15/16 = 93,75%** | **16/16 = 100%** | **16/16 = 100%** |
| Có expected (A/B/C) | 19/20 = 95% | 20/20 = 100% | 20/20 = 100% |
| PARTIAL, chỉ đúng chủ đề ứng viên | 4/4 | 4/4 | 4/4 |

**93,75% là Top-1 Retrieval Accuracy trên 16 câu DIRECT + PARAPHRASE, không phải “RAG chính xác 93,75%”.** B05 sai Top-1. Sau threshold: 18/20 IN accepted, 2/20 false reject (B03/B07); 4/4 OUT rejected, 0/4 false positive OUT. B05 vẫn có Top-1 sai dù vượt ngưỡng.

## 21. Kết quả Generation

Nguồn: stage5-4-results.json → metrics/questions/manualEvaluation, mẫu số 24 câu, không gộp request xác minh model hoặc lượt dừng trước đó.

| Chỉ tiêu | Kết quả |
| --- | --- |
| Gọi Gemini | 18 lần |
| Answer trả về | 14/24 = 58,33% |
| Fallback | 8/24 = 33,33% (6 gate, 2 thiếu context) |
| Lỗi evidence | 2/24 = 8,33% (A03/C01) |
| Groundedness thủ công | 13 PASS, 1 PARTIAL trên **14 answer** |
| Source correctness | 14/14 trên answer trả về |
| Nhận biết thiếu context nhóm C | 2/4 PASS; C01/C03 chưa đạt |
| OUT_OF_KB | D01–D04 fallback, 0 Gemini call cho 4 câu |

Manual evaluation do Codex đọc answer/context với rubric PASS/PARTIAL/FAIL; chưa có người chấm độc lập, không phải metric tự động tuyệt đối. Không tính fallback/lỗi là grounded answer. Có khẳng định thiếu căn cứ ở B01; C01 ứng viên chưa trả cho người dùng có giả định thiếu căn cứ. Không báo hallucination=0 chỉ vì nguồn khớp.

## 22. Latency

Giữ đúng lượt và đơn vị từ JSON; không trộn số đo local và mạng hoặc suy ra tốc độ production.

| Nguồn / thành phần | Trung bình | Mẫu số / phạm vi |
| --- | ---: | --- |
| GĐ5.3 CLI: query embedding | 4,177 ms | 24 câu × 3 lượt; loại cold start/warm-up |
| GĐ5.3 CLI: search/ranking | 0,582 ms | cùng lượt CLI |
| GĐ5.3 CLI: total retrieval | 5,076 ms | cùng lượt CLI; không HTTP |
| GĐ5.4: query embedding | 5,853 ms | 24 câu trong lượt generation |
| GĐ5.4: retrieval | 1,384 ms | 24 câu, khác lượt GĐ5.3 |
| GĐ5.4: context + xác minh trước gọi | 2,162 ms | 24 câu, gồm 0 khi gate reject |
| GĐ5.4: Gemini trên tất cả câu | 1275,564 ms | 24 câu, 6 không gọi tính 0 |
| GĐ5.4: Gemini chỉ câu có gọi | **1700,752 ms ≈ 1,701 giây** | 18 lượt, mạng/provider |
| GĐ5.4: total answerQuestion | **1287,920 ms ≈ 1,288 giây** | 24 câu, gồm fallback/lỗi |

Cold start GĐ5.4 được ghi riêng, khoảng 2577,416 ms. Total answerQuestion không gồm prepare kiểm tra/cache corpus trước mỗi request, khởi tạo model, JWT, HTTP/browser render nên không phải end-to-end UI. Không suy ra p95 hoặc khả năng chịu tải từ một lượt nhỏ.

## 23. Frontend và kiểm thử cuối

**Lịch sử GĐ5.5:** browser 34/34; API nghiệp vụ 83/83; browser cũ 51/51; RAG logic/API 23/23; build PASS; 1 Gemini call thật trả answer + nguồn. Đây vẫn là kết quả GĐ5.5.

**Kiểm thử mới GĐ5.6:**

| Bộ chạy lại | Kết quả |
| --- | --- |
| GĐ5.2 logic | 8/8 PASS |
| GĐ5.3 logic | 17/17 PASS |
| GĐ5.4 logic/API mock Gemini | 23/23 PASS |
| GĐ5.5 browser --mock-only + fallback backend/retrieval thật | 33/33 PASS |
| stage4-2-api.cjs | 30/30 PASS |
| stage4-2-regression.cjs | 53/53 PASS |
| stage2-browser.cjs | 7/7 PASS |
| stage3-browser.cjs | 5/5 PASS |
| stage4-4-browser.cjs | 39/39 PASS |
| /api/health và /api/health/db | 2/2 HTTP 200 |
| Pipeline E5/chunk thật, metadata/hash so GĐ5.2 | PASS: 8 bài/24 chunk/384 chiều |
| Retrieval thật mẫu A01/D01 | 2/2 khớp ranking/ngưỡng đã lưu |
| Đối chiếu JSON lịch sử Retrieval/Generation | 2/2 PASS |
| Frontend production build | PASS |

GĐ5.6 browser có **33/33**, ít hơn 34 của GĐ5.5 vì bỏ đúng test gọi Gemini thật (#29) bằng --mock-only. Login/JWT/MySQL thật; fallback ngoài KB dùng backend + E5 + retrieval thật; answer/error UI dùng mock. Không gọi lại 24 câu Gemini hay experiment retrieval để tạo benchmark mới. GĐ5.2/5.3 chạy các hàm runLogic hiện có, một pipeline document và hai query mẫu; không ghi là đã chạy lại trọn bộ experiment 27/21 lịch sử.

Các lệnh nền tảng: node tests/stage5-2-logic.cjs, node tests/stage5-3-logic.cjs, node tests/stage5-4-logic.cjs, node tests/stage5-4-api.cjs, node tests/stage5-5-browser.cjs --mock-only và build Vite. Runner tạm điều phối thêm snapshot, gọi pipeline/retrieve export, health và các suite stage4-2-api, stage4-2-regression, stage2-browser, stage3-browser, stage4-4-browser. Nó backup/restore báo cáo và dọn đúng Ticket browser mới sau kiểm id/code/title/creator; không dùng runner cũ có assertion “chưa có RAG”. Không chạy các script experiment GĐ5.3/GĐ5.4 ghi báo cáo cũ. JSON mới ghi tên/kết quả từng test.

## 24. Các trường hợp chưa đạt

| Câu | Thuộc bước | Quan sát và giới hạn suy luận | Hướng nghiên cứu, chưa triển khai |
| --- | --- | --- | --- |
| B05 | Retrieval | KB máy in Top-1 0,854963; KB máy chậm đúng rank 2 0,852831. Generation chọn đúng nguồn rank 2 trong context. Không chứng minh chắc nguyên nhân từ một ví dụ. | So Top-K, reranking/hybrid bằng tập riêng |
| B03 | Threshold | Nguồn đúng nhưng 0,8504481365 < 0,8504602348, false reject rất sát biên. | Dataset calibration lớn hơn, phân tích trade-off, không làm tròn/ngẫu nhiên hạ ngưỡng |
| B07 | Threshold | Nguồn microphone đúng Top-1, score 0,839633 dưới ngưỡng; thấp hơn vài OUT. | Mở rộng paraphrase/OUT và kiểm threshold trên DEV mới |
| A03 | Evidence | Quote 537 đơn vị vượt 500 nhưng literal match đúng; answer ứng viên có căn cứ, bị chặn vì contract. | Ràng buộc schema và đánh giá rule trên DEV, không nới trên TEST cũ |
| C01 | Evidence + Ambiguity | Quote 679 bị chặn; ứng viên hiểu tài nguyên là thư mục mạng dù chưa rõ. Không coi lỗi 502 là fallback hiểu thiếu thông tin đúng. | Tách kiểm định quote với nhận biết cần làm rõ |
| B01 | Generation/Groundedness | Khẳng định do Wi-Fi bị tắt dù triệu chứng chưa xác minh nguyên nhân; 1 PARTIAL. | Prompt/claim verification hoặc yêu cầu diễn đạt khả năng, thử nghiệm riêng |
| C03 | Ambiguity | Hướng dẫn website có trong nguồn nhưng trang/lỗi đăng nhập chưa rõ; không hỏi lại/từ chối. | Clarification, multi-turn có thiết kế/đánh giá riêng |

Các hướng trên là đề xuất, không có metric cải thiện mới. Không sửa output/nhãn cũ hoặc cho rằng mọi lỗi là bug kiến trúc nghiêm trọng.

## 25. Phân tích nguyên nhân và hạn chế

Phải tách bảy góc đánh giá: retrieval quality (đúng nguồn), generation quality (đáp ứng câu hỏi), groundedness (khẳng định có căn cứ), source correctness (nguồn hỗ trợ), OUT rejection, latency và UX. Một chỉ số không đại diện tất cả. Top-K chứa nguồn đúng có thể giúp B05 nhưng thêm nhiễu; score/ngưỡng không nhận ra thiếu chi tiết C02/C04; literal quote không xác minh toàn bộ lời diễn đạt B01.

Corpus 8 demo/24 câu nhỏ; ngưỡng thăm dò, DEV/TEST có câu gần nghĩa; chưa dữ liệu doanh nghiệp lớn, nhiều lần chạy, human agreement hoặc thử tải. Vector RAM, không persistent index, chưa reranking/hybrid. Không history/chat memory/multi-turn clarification. Model phụ thuộc provider/quota/network, chưa provider fallback. Evidence có giới hạn độ dài, chuẩn hóa và kiểm định ngữ nghĩa chưa đầy đủ. False reject và Top-1 sai đã ghi nhận; generation chưa grounded hoàn toàn. Mọi kết luận giới hạn trong dữ liệu và phiên bản đã lưu.

## 26. Đề xuất cải tiến

Chưa triển khai: mở rộng corpus và bộ đánh giá độc lập; người chấm/feedback; khảo sát threshold trên DEV mới; đối chứng chunk size/full article; hybrid keyword + vector, reranking; kiểm từng claim và schema evidence; clarification; persistent/vector index khi quy mô cần; re-index nền/incremental bên cạnh hash check theo request đã có; monitoring latency/quota/chất lượng; provider fallback sau phê duyệt model/chi phí; chat history với phân quyền và quản lý dữ liệu phù hợp.

Đánh giá từng biến riêng, báo trade-off, giữ tập kiểm tra độc lập. Không dùng TEST cũ vừa điều chỉnh vừa công bố tăng điểm. Không coi những đề xuất này là phần đã hoàn thành hoặc tự chuyển sang giai đoạn mới.

## 27. Khả năng áp dụng, bảo toàn dữ liệu và minh chứng

**Đồ án hiện tại:** MySQL nghiệp vụ + KB PUBLISHED + E5 local + cosine trong RAM + Gemini + threshold/fallback + citation + người dùng chuyển sang Ticket đủ minh họa pipeline trên corpus nhỏ. “Chuyển hỗ trợ sang IT” ở đây là người dùng chủ động tạo Ticket, không SLA/escalation tự động. Có thể demo và phân tích giới hạn, chưa khẳng định sẵn sàng production.

**Nếu mở rộng thực tế:** cần đo quy mô/tài nguyên/chất lượng, cân nhắc các phương án mục 26; không mặc định vector DB hoặc provider mới là cần thiết cho tám bài.

| Bảng | Trước GĐ5.6 | Sau kiểm thử |
| --- | ---: | ---: |
| users | 3 | 3 |
| tickets | 3 | 3 |
| ticket_history | 17 | 17 |
| knowledge_articles | 8 | 8 |

8 bài vẫn PUBLISHED. Deep equality toàn bộ cột/dòng trước/sau; dữ liệu test tạm dọn đúng ID, không xóa dữ liệu cũ hoặc đổi schema/reset AUTO_INCREMENT. Bộ đếm có thể tăng do regression tạo/dọn dữ liệu tạm.

Security: backend/.env ignore; quét giá trị secret local và pattern key/JWT trong file thuộc Git cùng bundle, không in giá trị. Không phát hiện secret thật/cache/dependency artifact; browser test quan sát không gọi Gemini trực tiếp. Không phải pentest hoặc quét toàn lịch sử Git. Các kết quả cũ và source nghiệp vụ có hash/so sánh byte; chỉ tài liệu tổng hợp/README thay đổi.

[Checklist 14 hình](giai-doan-5-minh-chung.md) chỉ rõ màn hình, phần chụp và ý nghĩa; không cần chụp .env, secret, password hoặc token. Checklist là kế hoạch thu minh chứng, không khẳng định đã chụp đủ 14 hình.

## 28. Kết luận

Giai đoạn 5.6 đã hoàn thành.
Phần RAG của đồ án đã được tổng hợp, đánh giá và hoàn thiện ở phạm vi nghiên cứu/thực nghiệm đã xác định.

Đã kiểm chứng mối liên hệ code–API–UI–nghiệp vụ–báo cáo, giữ nguyên kết quả tốt và chưa đạt, chạy kiểm thử cuối không gọi Gemini thật. Các giới hạn chất lượng và quy mô vẫn còn như mô tả. Dừng sau GĐ5.6; không bắt đầu GĐ6, thêm chức năng hoặc đổi thuật toán.
