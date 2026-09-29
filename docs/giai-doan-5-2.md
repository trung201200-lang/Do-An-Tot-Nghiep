# Giai đoạn 5.2 — Thực nghiệm chunking và embedding

Ngày chạy: 29/09/2026. Nguồn số liệu: [stage5-2-results.json](stage5-2-results.json), timestamp `2026-09-29T10:40:39.063Z`. Các kết quả ghi **ĐÃ THỰC NGHIỆM** dưới đây lấy từ model và dữ liệu MySQL thật. Các việc thuộc GĐ5.3 được ghi **DỰ KIẾN**, chưa triển khai.

## 1. Mục tiêu

ĐÃ THỰC NGHIỆM pipeline `Knowledge Base → chuẩn hóa text → chunk → model embedding → vector → kiểm tra`. Kiểm chứng tính hợp lệ, metadata truy vết và khả năng chạy lại mà không thay đổi dữ liệu nghiệp vụ. Chưa đánh giá chất lượng Retrieval, chưa tạo câu trả lời.

## 2. Dữ liệu đầu vào

Đọc trực tiếp `it_support_rag.knowledge_articles` bằng SELECT có tham số `WHERE status = ?`, giá trị `PUBLISHED`, sắp xếp theo id. Hiện có 8 bài PUBLISHED, mã KB-000008 đến KB-000015. Pipeline không hard-code các id hoặc giới hạn 8 bài; bộ integration test kiểm tra mốc dữ liệu demo hiện tại và dừng nếu số lượng khác dự kiến.

Không lấy DRAFT/ARCHIVED. Giữ metadata `article_id`, `code`, `title`, `status`, `chunk_index`, `chunk_text`; thêm offset `start/end`, `token_count`, `overlap_chars` trong bộ nhớ. Không thay đổi bảng hoặc nội dung gốc. Hash SHA-256 của title/content trong báo cáo giúp đối chiếu nguồn, không phải embedding.

## 3. Preprocessing

Chuẩn hóa Unicode NFC; đổi CRLF/CR thành LF; bỏ tab/khoảng trắng cuối dòng; gom từ 3 newline liên tiếp thành 2; trim đầu/cuối văn bản. Giữ dấu tiếng Việt, chữ hoa/thường, dấu câu, IP, đường dẫn, lệnh và khoảng trắng bên trong dòng. Không dịch, bỏ stopword hoặc sửa hướng dẫn.

Ví dụ đã assert trực tiếp:

```text
Input:  "  Không xóa dữ liệu\r\nIP: 127.0.0.1  "
Output: "Không xóa dữ liệu\nIP: 127.0.0.1"
```

Test thêm Unicode NFD, emoji và khoảng trắng trong lệnh. Coverage được kiểm tra trên văn bản đã chuẩn hóa: mọi ký tự không phải khoảng trắng phải có trong ít nhất một chunk, đồng thời từng chunk phải khớp đúng lát cắt nguồn.

## 4. Phương pháp chunking

Theo GĐ5.1: hybrid ưu tiên đoạn văn, có giới hạn độ dài và token. Trong cửa sổ tối đa 800 Unicode code point, tìm ranh giới đoạn văn; nếu không có thì thử xuống dòng, khoảng trắng, cuối cùng mới cắt theo giới hạn. Bài ngắn đủ ngân sách giữ nguyên một chunk.

Mỗi lần phải phủ thêm nội dung mới. Tokenizer thật đếm toàn bộ `passage: title\nchunk`, kể cả token đặc biệt. Nếu vượt 512 token, giảm ranh giới; nếu overlap chiếm hết ngân sách, bỏ overlap lần đó để tiến lên. Từ chối tiêu đề quá dài hoặc nội dung không thể chứa trong ngân sách. Không truncation ngầm. Index bắt đầu từ 0 theo từng bài, offset tính trên code point của nội dung chuẩn hóa.

## 5. Vì sao chọn CHUNK_SIZE = 800

Giữ đúng cấu hình khởi đầu GĐ5.1, đủ chỗ cho một nhóm hướng dẫn ngắn, dễ giải thích và chạy CPU trên 8 bài demo. Đây là giới hạn ký tự, không phải 800 token; có kiểm tra thêm giới hạn 512 token của model. Chưa chứng minh 800 là tối ưu về Retrieval.

## 6. CHUNK_OVERLAP = 120

Overlap tối đa 120 code point, tương đương 15% giới hạn chunk, nhằm giữ ngữ cảnh ở chỗ nối. Đầu overlap dời tới ranh giới từ nên thực tế có thể ngắn hơn 120. Khi hết ngân sách token có thể bỏ overlap. Các hằng số đặt tập trung trong `backend/src/rag/config.js`.

## 7. Ví dụ chunk thật

Bài `KB-000008` — **Không kết nối được Wi-Fi**, `article_id = 8`, trạng thái PUBLISHED. Dưới đây là toàn bộ 3 chunk trong báo cáo, không phải ví dụ tự tạo.

### Chunk 1 (chunk_index = 0)

Offset [0, 413), 413 ký tự, 120 token, overlap 0 ký tự.

```text
[DEMO-KB:wifi]
Dữ liệu demo phục vụ đồ án, không phải quy trình CNTT chính thức.

Hiện tượng
Máy tính không nhìn thấy mạng Wi-Fi, không kết nối được hoặc báo đã kết nối nhưng không truy cập được tài nguyên cần dùng.

Nguyên nhân thường gặp
Wi-Fi trên thiết bị bị tắt, chế độ máy bay đang bật, tín hiệu yếu hoặc cấu hình kết nối đã lưu không còn phù hợp. Sự cố cũng có thể nằm ở mạng chung, không chỉ trên một máy.
```

### Chunk 2 (chunk_index = 1)

Offset [293, 946), 653 ký tự, 184 token, overlap 120 ký tự.

```text
tín hiệu yếu hoặc cấu hình kết nối đã lưu không còn phù hợp. Sự cố cũng có thể nằm ở mạng chung, không chỉ trên một máy.

Các bước kiểm tra/xử lý cơ bản
1. Kiểm tra Wi-Fi đã bật và chế độ máy bay đã tắt. Di chuyển đến vị trí có tín hiệu tốt hơn.
2. Xác nhận đang chọn đúng mạng được phép sử dụng. Không kết nối mạng lạ chỉ vì có tên tương tự.
3. Thử ngắt rồi kết nối lại. Nếu cần quên mạng đã lưu, chỉ thực hiện khi đã có thông tin kết nối hợp lệ để đăng nhập lại.
4. Lưu công việc rồi khởi động lại máy. Hỏi người dùng gần đó xem họ có gặp cùng hiện tượng hay không.
5. Không tự khởi động lại thiết bị mạng dùng chung hoặc cài driver từ nguồn không rõ.
```

### Chunk 3 (chunk_index = 2)

Offset [827, 1140), 313 ký tự, 87 token, overlap 119 ký tự.

```text
có gặp cùng hiện tượng hay không.
5. Không tự khởi động lại thiết bị mạng dùng chung hoặc cài driver từ nguồn không rõ.

Khi nào cần gửi Ticket cho IT
Nếu vẫn lỗi, tạo Ticket ghi thời điểm xảy ra, thông báo lỗi, phạm vi ảnh hưởng và các bước đã thử. Không gửi mật khẩu Wi-Fi hoặc thông tin đăng nhập trong Ticket.
```

## 8. Embedding là gì

Embedding biến một đoạn văn thành vector số biểu diễn đặc trưng/ngữ nghĩa do model học được. Quy trình ở đây là `Text → Chunk → Embedding Model → Vector`. Vector gần nhau có thể hỗ trợ đo tương đồng ở bước Retrieval sau này; không có nghĩa hai câu giống nhau hoàn toàn hoặc câu trả lời chắc chắn đúng.

Model trả biểu diễn từng token; code lấy trung bình các token có attention mask hợp lệ, rồi chuẩn hóa L2 để vector có độ dài xấp xỉ 1. Title được thêm vào đầu input nhằm cung cấp ngữ cảnh, còn metadata gốc vẫn giữ nguyên.

## 9. Model thực tế

- Provider: chạy local trên CPU bằng Transformers.js/ONNX Runtime, không gọi dịch vụ embedding trả phí.
- Model gốc: `intfloat/multilingual-e5-small`; artifact ONNX: `Xenova/multilingual-e5-small`.
- Revision cố định: `761b726dd34fb83930e26aab4e9ac3899aa1fa78`.
- Kiểu lượng tử hóa: `q8`, file `onnx/model_quantized.onnx`.
- Thư viện trực tiếp mới: `@huggingface/transformers` phiên bản cố định `4.3.0`.
- Input: `passage: <title đã chuẩn hóa>\n<chunk>`, tối đa 512 token kể cả prefix/title/token đặc biệt.
- Không cần API key. Lần đầu tải tokenizer/config/model công khai; inference thực hiện local, không gửi bài KB tới API embedding.

Lựa chọn giữ đúng E5 đa ngôn ngữ, CPU, mean pooling + L2 trong GĐ5.1. Bản thư viện ban đầu thử 3.8.1 có 2 cảnh báo mức high do dependency sharp; chuyển sang 4.3.0 để dùng dependency đã cập nhật. Kết quả npm audit sau cài đặt: 0 lỗ hổng được báo tại thời điểm chạy. Không đổi phiên bản các dependency đã tồn tại trước GĐ5.2 và không chạy audit fix ép buộc.

Nguồn kỹ thuật: [E5 model card](https://huggingface.co/intfloat/multilingual-e5-small), [ONNX artifacts](https://huggingface.co/Xenova/multilingual-e5-small/tree/761b726dd34fb83930e26aab4e9ac3899aa1fa78/onnx), [Transformers.js trên Node](https://huggingface.co/docs/transformers.js/en/tutorials/node), [dtype/quantization](https://huggingface.co/docs/transformers.js/en/guides/dtypes).

## 10. Vector dimension và representation

ĐÃ THỰC NGHIỆM: cả 24 vector có **384 chiều**, là mảng số hữu hạn, không NaN/Infinity, norm L2 trong sai số `1e-5`. Representation là `{ ...metadataChunk, embedding: number[] }`. Vector mẫu đầu tiên có norm 1; JSON chỉ lưu 8 số đầu làm minh chứng, không dump toàn bộ vector.

Vector đầy đủ chỉ tồn tại trong bộ nhớ khi pipeline chạy. Không thêm bảng MySQL hoặc vector database. Cache artifact model và báo cáo CLI đặt tại `backend/.cache/rag/`, đã được Git ignore. File model q8 khoảng 118 MB và tokenizer khoảng 17 MB không vào commit.

## 11. Pipeline và cách chạy lại

Các module mới:

| File | Trách nhiệm |
| --- | --- |
| `backend/src/rag/config.js` | Cấu hình chunk, model, revision, cache |
| `backend/src/rag/text.js` | Chuẩn hóa, chia chunk, kiểm tra coverage |
| `backend/src/rag/embedding.js` | Nạp tokenizer/model, pooling/L2, validate vector |
| `backend/src/rag/pipeline.js` | SELECT PUBLISHED, chạy các bước và thống kê |
| `backend/src/rag/experiment.js` | CLI, xuất báo cáo local và đóng kết nối/model |
| `backend/tests/stage5-2-logic.cjs` | Test logic độc lập |
| `backend/tests/stage5-2-experiment.cjs` | Integration model thật, DB trước/sau và regression |

Từ thư mục backend, với MySQL và cấu hình `.env` hiện có:

```powershell
npm ci
npm run experiment:embedding
```

CLI chỉ SELECT, không seed, INSERT/UPDATE/DELETE hay đổi schema. Báo cáo CLI ghi `backend/.cache/rag/experiment-summary.json`; không ghi đè kết quả kiểm thử đã xác minh trong docs. Lệnh CLI đã chạy thành công sau khi sửa lỗi chunk.

Test logic không cần MySQL/model:

```powershell
node tests/stage5-2-logic.cjs
```

Integration trên database demo local, backend API đang chạy theo README:

```powershell
npm run test:stage5-2
```

Lệnh integration ghi `docs/stage5-2-results.json` và gọi các test API hiện có. Những test regression tạo/thay đổi dữ liệu tạm theo cơ chế của chúng rồi dọn/khôi phục; pipeline embedding bản thân chỉ đọc. Test chặn NODE_ENV production và DB host không phải local. Không chạy đồng thời với thao tác chỉnh sửa dữ liệu của người dùng nếu muốn so sánh snapshot chính xác. Lần đầu cần Internet để tải artifact; các lần sau dùng cache. Không commit cache hoặc `.env`.

## 12. Kết quả thực nghiệm

ĐÃ THỰC NGHIỆM trên 8 bài thật: **24 chunk, 3 chunk/bài**. Nhỏ nhất 294, lớn nhất 797, trung bình **491,17 code point/chunk**. Hai lần pipeline liên tiếp đều hợp lệ, lần hai cho chunk và metadata giống lần đầu; tất cả vector được tạo lại và validate thành công. Không dùng vector giả hoặc thay embedding bằng hash.

Một lần chạy ban đầu phát hiện lỗi ranh giới overlap chỉ thêm khoảng trắng, khiến chunk không tiến lên. Đã sửa để chọn ranh giới thêm nội dung mới hoặc thử lại không overlap, rồi chạy lại cả logic, integration và regression PASS. Báo cáo JSON hiện tại là kết quả lần chạy hoàn tất sau sửa lỗi.

## 13. Thống kê chunk theo article

Các độ dài và token liệt kê theo `chunk_index` 0, 1, 2. Ký tự tính trên chunk; token tính trên toàn input embedding, gồm title/prefix/token đặc biệt.

| Article | Số chunk | Độ dài từng chunk (code point) | Token từng input |
| --- | ---: | --- | --- |
| KB-000008 — Không kết nối được Wi-Fi | 3 | 413, 653, 313 | 120, 184, 87 |
| KB-000009 — Máy in không in được tài liệu | 3 | 382, 780, 307 | 115, 220, 86 |
| KB-000010 — Quên mật khẩu tài khoản nội bộ | 3 | 381, 777, 363 | 109, 210, 101 |
| KB-000011 — Không gửi hoặc nhận được email | 3 | 357, 661, 450 | 104, 183, 120 |
| KB-000012 — Máy tính hoạt động chậm | 3 | 406, 784, 294 | 111, 212, 86 |
| KB-000013 — Không truy cập được thư mục mạng nội bộ | 3 | 379, 797, 306 | 107, 214, 87 |
| KB-000014 — Microphone không hoạt động khi họp trực tuyến | 3 | 381, 664, 454 | 105, 181, 127 |
| KB-000015 — Không truy cập được website nội bộ | 3 | 406, 781, 299 | 115, 208, 87 |

Offset, overlap và sourceHash chi tiết có trong JSON.

## 14. Thời gian xử lý

Số đo thực tế bằng `performance.now()`, đơn vị **ms**, làm tròn khi trình bày. Máy Windows x64, Node v22.17.1, Intel Core i7-11800H 2.30 GHz, RAM khoảng 7,71 GiB.

| Bước | Lần 1 | Lần 2 |
| --- | ---: | ---: |
| Đọc MySQL | 3,5522 | 1,3486 |
| Preprocessing | 0,0913 | 0,0813 |
| Chunking (gồm đếm token) | 34,5685 | 16,2156 |
| Embedding 24 chunk | 389,9318 | 375,2514 |
| Validation | 0,7203 | 0,8198 |
| Tổng pipeline | 430,3466 | 394,3328 |

Nạp model từ cache trước lần 1: **1663,1528 ms**, ghi riêng, không nằm trong tổng pipeline. Lần 2 dùng cùng model đã nạp. Thời gian tải artifact lần đầu chưa được đo thành benchmark. Tổng gồm chi phí điều phối nên không nhất thiết bằng tổng chính xác các dòng nhỏ. Chuẩn hóa lặp trong chunker được tính vào chunking. Chỉ có hai lần integration, không tính median hoặc suy rộng thành hiệu năng ổn định; lệnh CLI riêng cũng đã chạy thành công nhưng không trộn số đo vào bảng này.

## 15. Kiểm thử và regression

### Test 1–17 và kiểm tra bổ sung

| Test | Nội dung | Kết quả |
| --- | --- | --- |
| 1 | Chỉ sử dụng PUBLISHED; SQL tham số và chặn trạng thái khác đã kiểm tra logic | PASS |
| 2 | Dữ liệu hiện tại có 8 article | PASS |
| 3 | Preprocessing giữ tiếng Việt và dữ kiện kỹ thuật | PASS |
| 4 | Không chunk rỗng | PASS |
| 5 | Mỗi chunk có article_id đúng nguồn | PASS |
| 6 | Mỗi chunk có code đúng nguồn | PASS |
| 7 | Mỗi chunk có title đúng nguồn | PASS |
| 8 | chunk_index liên tiếp từ 0 theo article | PASS |
| 9 | Mọi article được phủ toàn bộ nội dung chuẩn hóa | PASS |
| 10 | Model thật tạo embedding cho mọi chunk | PASS |
| 11 | Embedding là vector số | PASS |
| 12 | Mọi vector có 384 chiều | PASS |
| 13 | Không có NaN | PASS |
| 14 | Không có Infinity | PASS |
| 15 | Metadata không đổi sau embedding, L2 hợp lệ | PASS |
| B1 | Giới hạn ký tự/overlap/token và số token tính trên toàn input thật | PASS |
| B2 | Tokenizer thật chia tiếp khi input vượt 512 token, giữ coverage | PASS |
| 16 | Pipeline lần hai chạy model thật và giữ dữ liệu KB | PASS |
| 17 | Toàn bộ dữ liệu nghiệp vụ trước/sau hai lần pipeline không đổi | PASS |

**8/8 test logic PASS**: NFC/line break/tiếng Việt/khoảng trắng kỹ thuật; SQL PUBLISHED tham số; chặn DRAFT/ARCHIVED; bài ngắn; Unicode/emoji/đoạn dài/coverage; nhánh ngân sách token hẹp; dữ liệu/cấu hình không hợp lệ; validator từ chối NaN/Infinity/sai chiều/string/vector 0. Test logic dùng bộ đếm ký tự giả lập chỉ để kiểm tra nhánh thuật toán, không dùng để công bố số token hoặc embedding thật.

Integration dùng tokenizer/model ONNX thật. B2 đưa 700 ký tự CJK vào tokenizer, xác nhận input ban đầu vượt 512 token và được chia tiếp không mất nội dung; đây là fixture trong bộ nhớ, không thêm vào KB. Dữ liệu MySQL hiện đều PUBLISHED, vì vậy kiểm tra loại DRAFT/ARCHIVED kết hợp SQL contract và nhánh chặn trạng thái trong test logic, không giả vờ có hai loại dữ liệu đó trong corpus thật.

### Regression hiện có

| Bộ test | Kết quả |
| --- | --- |
| `stage2-api.cjs` qua `stage4-2-regression.cjs` | 23/23 PASS: bcrypt, login, JWT, /me, RBAC, users, INACTIVE/ACTIVE, health và MySQL |
| `stage3-api.cjs` qua `stage4-2-regression.cjs` | 30/30 PASS: Ticket, phân quyền, workflow, history, race, rollback transaction |
| `stage4-2-api.cjs` | 30/30 PASS: CRUD/status/quyền/validation Knowledge Base |

Tổng regression **83/83 PASS**. Báo cáo của các giai đoạn cũ được khôi phục nguyên byte sau chạy. Không chạy suite `stage4-5-regression.cjs` vì có assertion yêu cầu chưa tồn tại implementation embedding; các bộ API phù hợp bên trên đã được chạy. Frontend không thay đổi nên không build hoặc tuyên bố đã kiểm tra giao diện ở lần này.

### Database cuối

| Bảng | Số dòng trước | Số dòng sau |
| --- | ---: | ---: |
| users | 3 | 3 |
| tickets | 3 | 3 |
| ticket_history | 17 | 17 |
| knowledge_articles | 8 | 8 |

Cả 8 bài vẫn PUBLISHED. Integration so sánh sâu toàn bộ cột/dòng của cả 4 bảng trước/sau hai lần pipeline và sau regression; `dataPreserved: true`. Snapshot này kiểm tra dữ liệu bản ghi, không khẳng định bộ đếm AUTO_INCREMENT không tăng khi regression tạo rồi dọn dữ liệu tạm. Không reset bộ đếm và không đổi schema.

## 16. Hạn chế

- Corpus nhỏ, đồng dạng và chỉ có dữ liệu demo; chưa đại diện tài liệu doanh nghiệp.
- Chunking ưu tiên đoạn nhưng overlap có thể bắt đầu giữa câu. Giữ marker/disclaimer demo nên vẫn có text lặp giữa các bài.
- Chưa so sánh nhiều size/overlap hoặc đánh giá Recall/HitRate/MRR; chưa kết luận chunking tốt về Retrieval.
- q8 giảm dung lượng nhưng có thể khác vector float32; chưa đo ảnh hưởng tới Retrieval tiếng Việt.
- Vector chỉ trong RAM, chưa có lưu bền, index, đồng bộ khi bài sửa/đổi trạng thái hoặc xóa; CLI cần chạy lại để tính lại.
- Input có title quá dài hoặc bài rỗng sẽ dừng với lỗi, không bỏ qua âm thầm. Không batch/GPU; đọc toàn bộ PUBLISHED phù hợp corpus nhỏ, chưa đánh giá quy mô lớn.
- Test snapshot cần database demo ổn định; regression có dữ liệu tạm, không phải tác vụ chỉ đọc như CLI.
- Số đo phụ thuộc máy/cache; không bao gồm tải model lần đầu và không phải benchmark chất lượng ngữ nghĩa.

## 17. Nhận xét

ĐÃ THỰC NGHIỆM và kiểm chứng: đọc đúng nguồn PUBLISHED, chunk truy vết được, phủ nội dung chuẩn hóa, vector thật 384 chiều hữu hạn/L2, chạy lại an toàn cho dữ liệu gốc và API nghiệp vụ vượt regression. Kết quả đủ để chuyển sang thiết kế Retrieval khi được yêu cầu, chưa chứng minh hệ thống trả lời đúng hoặc tìm đúng tài liệu.

## 18. Chuẩn bị GĐ5.3 — DỰ KIẾN, CHƯA TRIỂN KHAI

Có thể tái sử dụng metadata/vector để thiết kế lưu trữ, query embedding và phép đo tương đồng ở giai đoạn sau. Bộ 24 câu hỏi dự kiến của GĐ5.1 chưa chạy trong GĐ5.2; sẽ cần nhãn nguồn đúng và tiêu chí Retrieval để đánh giá, cùng cách xử lý bài thay đổi trạng thái. Chưa triển khai query embedding, similarity search, Top-K, prompt, LLM, API hỏi đáp hoặc chatbot.

Giai đoạn 5.2 đã hoàn thành. Dừng tại đây, chờ yêu cầu GĐ5.3.
