# GĐ7.2.2 — Ollama: quyết định trả lời và trích dẫn

Ngày đo: 2026-11-02. Nhánh: feature/local-rag. Chỉ Ollama local qwen2.5:1.5b,
daemon 0.40.13. Không gọi Gemini, không thay database/KB, không ghi đè báo cáo cũ.

## Điều đã kiểm chứng

Prompt chung ban đầu yêu cầu true chỉ khi context hỗ trợ trực tiếp; thiếu thông tin
thì false và evidence rỗng. Schema chung chỉ quy định kiểu/field, không ràng buộc
quan hệ giữa answered và evidence. normalizeOutput giữ nguyên nhánh false → fallback;
không kiểm chứng hay công bố evidence trong nhánh false.

Đối chứng dùng E5/corpus thật: 8 bài PUBLISHED, 24 chunk. Với câu Wi-Fi đã báo lỗi,
context vẫn là ID 8, 13, 12; điểm cao nhất 0.904825778988364, threshold
0.8504602347669256. Nguồn Wi-Fi không bị bỏ khỏi retrieval.

Model trả true với nguồn Wi-Fi tổng hợp ngắn, nhưng prompt cũ + context thật trả
false với 3 evidence không hoàn toàn khớp. Như vậy không chứng minh model luôn
hiểu ngược boolean. Cũng không thể kết luận chỉ cần đảo false thành true: các
trích dẫn thực tế có lỗi. Cosine không phải phép kiểm chứng nội dung answer.

## Thay đổi cuối cùng

- ollamaPrompt.js: hướng dẫn riêng, định nghĩa answered là đủ căn cứ trả lời,
  không phải xác nhận sự cố đã được sửa; hỗ trợ hướng dẫn kiểm tra khi nguồn có
  bước phù hợp. Chỉ dẫn bằng tiếng Anh, yêu cầu câu trả lời tiếng Việt; 1392 ký tự
  so với 1606 ký tự của prompt chung. Dữ liệu QUESTION/CONTEXT giữ nguyên.
- Schema riêng Ollama giữ answered/answer/evidence và additionalProperties=false;
  giới hạn answer 1–1200 ký tự, evidence tối đa 3 đoạn, mỗi đoạn 20–500 ký tự.
  Không bắt answered=true hoặc bắt evidence không rỗng khi false.
- ollamaClient.js gửi schema riêng, temperature=0, seed=42 để giảm biến thiên.
  Không bảo đảm tái lập tuyệt đối giữa phần cứng/phiên bản/lượt chạy.
- generationService.js chọn prompt riêng chỉ khi provider là ollama.
- generationPrompt.js, generationOutput.js, provider selection và Gemini không đổi.
  Validator chung vẫn bắt mọi evidence của answered=true phải khớp nguyên văn.
  Không nâng false thành true, không retry tự động, không chuyển sang Gemini.

## Thử nghiệm và các lượt thất bại

Tổng **30 HTTP POST /api/chat**, tất cả HTTP 200; HTTP 200 không có nghĩa output
đã qua validator. 29 lượt có bộ đếm runner; lượt service đầu chưa ghi bộ đếm khi
lỗi được đối chiếu access log Ollama tại 09:24:27 (giờ máy), đúng 1 request 200.
Không tính lượt chẩn đoán 9.69 giây ở nhiệm vụ trước vào tổng này.

| Đợt | Số gọi | Cấu hình/kết quả |
|---|---:|---|
| A | 4 | Prompt/schema cũ, temp=0 seed=42: nguồn ngắn trả lời; chi tiết DNS thiếu và context rỗng fallback; Wi-Fi thật false + evidence sai |
| B | 4 | Prompt tiếng Việt thử đầu, schema cũ: nguồn ngắn sai evidence; Wi-Fi thật OLLAMA_INCOMPLETE; không chọn bản này |
| C | 4 | Prompt tiếng Anh mới, schema cũ, temp=0 seed=42: Wi-Fi thật true + 6 evidence khớp; ca thiếu căn cứ fallback |
| D | 4 | Prompt mới, schema cũ, lấy mẫu mặc định cũ: nguồn ngắn sai evidence; Wi-Fi thật 13 evidence bị INVALID_OUTPUT; context rỗng true bị INVALID_EVIDENCE |
| E | 4 | Prompt mới, schema cũ, temp=0 không seed: Wi-Fi trực tiếp đạt, ca thiếu căn cứ fallback |
| F | 4 | Qua service với schema cũ: cả 4 lượt thất bại; 3 lượt xác nhận OLLAMA_INVALID_EVIDENCE, lượt đầu chưa ghi mã. Lượt cuối true + 6 evidence nhưng chỉ 5 khớp, payload giống phép thử trực tiếp. Không coi đây là thành công |
| G | 2 | Cấu hình cuối: qua service Wi-Fi 2/2 GENERATED, 3/3 evidence khớp, nguồn chỉ KB-000008 |
| H | 4 | Cấu hình cuối: nguồn ngắn và Wi-Fi thật GENERATED; thiếu DNS và context rỗng INSUFFICIENT_CONTEXT |

Các đợt A/B/C dùng cùng 4 ca, cùng seed/temp và schema để kiểm tra tác động prompt.
Các ca thiếu căn cứ được cấp context cố định để kiểm tra riêng generation, không
thay đổi retrieval ứng dụng. Ca context rỗng cố tình gọi adapter trực tiếp; luồng
ứng dụng bình thường bỏ qua generation khi không có context.

| Ca | A: prompt cũ, ms | H: cấu hình cuối, ms | Kết quả cuối |
|---|---:|---:|---|
| Wi-Fi nguồn tổng hợp ngắn | 6939 | 1347 | true, evidence khớp |
| Hỏi IP DNS không có trong nguồn tổng hợp | 1099 | 1235 | false, fallback |
| Wi-Fi + context KB thật | 1917 | 3103 | true, 3 evidence khớp |
| Không có context | 437 | 2363 | false, fallback |

Lượt G qua service: generation 3176 và 2806 ms, tổng service 3569 và 2818 ms.
Latency gồm ảnh hưởng warm cache/model; mẫu rất nhỏ, không phải benchmark tốc độ.
Hai ca âm cuối vẫn có evidence dù false (1 và 3 phần tử); model chưa tuân thủ
hoàn toàn prompt. Backend loại chúng và trả sources=[] như trước.

Kết quả trích dẫn chỉ xác nhận substring và schema. Answer không phải toàn bộ
substring của một nguồn trong các phép đo này; chưa có đánh giá ngữ nghĩa thủ công
cho từng khẳng định. Trích dẫn đúng vẫn có thể đi kèm suy luận sai, thông tin ngoài
nguồn hoặc chọn nhầm nguồn. Không tuyên bố đã loại hallucination hay đã hiểu được
nguyên nhân nội tại khiến model chọn false. Đây là cải thiện có kiểm chứng trên
mẫu nhỏ, không phải chứng minh chất lượng tổng quát.

## Kiểm tra và tái lập

Unit (không gọi model/DB thật):

```powershell
cd backend
npm run test:stage7-2-2
npm run test:stage7-2
npm run test:rag-diagnostics
```

Runner live chỉ chạy khi chủ động cho phép; không nằm trong script unit:

```powershell
node tests/stage7-2-2-live.cjs --run-local
node tests/stage7-2-2-live.cjs --run-local --candidate
node tests/stage7-2-2-live.cjs --run-local --service
```

Hai lệnh đầu tối đa 4 gọi/lệnh, đối chứng prompt/schema cũ và bản cuối với
temp=0/seed=42. Lệnh service tối đa 2 gọi/lệnh, có thể dừng sớm khi validation lỗi.
Runner yêu cầu cấu hình ollama/qwen2.5:1.5b trên 127.0.0.1:11434, chỉ SELECT,
chặn ghi file, chặn generation ngoài endpoint local, không xuất KB/prompt/answer.
Các thử nghiệm trung gian B–F là lịch sử phát triển, không phải cấu hình hiện tại.
Mã GEMINI_INVALID_* trong đo trực tiếp là mã của validator chung; qua service
Ollama được đổi thành OLLAMA_INVALID_*. Không phải có gọi Gemini.

Unit kiểm tra Wi-Fi hợp lệ, câu hỏi không có căn cứ dù cosine cao, false kèm
answer/evidence, evidence bịa/viết lại/thiếu/ngắn/ghép suffix, prompt Gemini,
schema riêng và HTTP options. Không dùng mock để tuyên bố chất lượng model thật.

Kết quả cuối: 13/13 unit GĐ7.2.2, 18/18 Ollama, 11/11 provider, 58/58 logic
hồi quy và 18/18 diagnostics — tổng 118/118 PASS. `git diff --check` đạt.
Các thay đổi diagnostics có sẵn từ nhiệm vụ trước vẫn được giữ nguyên trong working tree;
GĐ7.2.2 không sửa embedding.js, pipeline.js, ragRoutes.js hay cấu hình .env thật.

Không khởi động lại backend đang phục vụ website trong nhiệm vụ này. Cần restart
để tiến trình đó nạp code mới; đã kiểm chứng qua service trong tiến trình độc lập.
