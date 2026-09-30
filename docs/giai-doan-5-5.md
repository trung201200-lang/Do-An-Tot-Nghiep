# Giai đoạn 5.5 – Tích hợp giao diện RAG

## 1. Mục tiêu và trạng thái ban đầu

Tích hợp pipeline RAG GĐ5.4 vào React để EMPLOYEE, IT, ADMIN tra cứu hướng dẫn CNTT. Trước sửa code: main sạch và đồng bộ origin/main tại 20364519daf8ea8d7f42e02b29cf40c98e364ccc. Đã đối chiếu tài liệu GĐ5.1–5.4, response contract, quyền Ticket và cấu trúc frontend hiện có.

Giữ nguyên model embedding Xenova/multilingual-e5-small, 384 chiều trong RAM; Gemini gemini-3.5-flash-lite với @google/genai 2.24.0; threshold 0.8504602347669256. Không thay backend production, schema, corpus, thuật toán, dữ liệu/bộ câu hỏi hoặc số liệu GĐ5.3/GĐ5.4.

## 2. Kiến trúc sau tích hợp

~~~mermaid
flowchart TD
    U[Người dùng đã đăng nhập] --> UI[React: Trợ lý CNTT]
    UI --> API[POST /api/rag/ask + JWT]
    API --> E[Embedding câu hỏi local]
    E --> R[Vector Retrieval trong RAM]
    R --> T{Đạt threshold?}
    T -->|Không| F[Fallback: answered=false]
    T -->|Có| K[Context từ KB PUBLISHED]
    K --> G[Gemini tại backend]
    G --> V{Kiểm tra output và evidence}
    V -->|Hợp lệ| A[Answer + sources hoặc fallback]
    V -->|Không hợp lệ| X[Lỗi có kiểm soát]
    A --> UI
    F --> UI
    X --> UI
~~~

React chỉ gọi backend bằng apiRequest và JWT hiện tại. Key không đi vào browser hoặc Vite env. Mỗi câu hỏi độc lập; chỉ giữ kết quả hiện tại trong state, rời tab chức năng/đăng xuất/reload thì xóa.

## 3. File tạo và sửa

| File | Thay đổi |
| --- | --- |
| frontend/src/RagAssistant.jsx | Mới: form hỏi đáp, loading, answer/sources, fallback, lỗi và điều hướng Ticket |
| frontend/src/App.jsx | Sửa: thêm mục Trợ lý CNTT cho ba role, render component |
| frontend/src/api.js | Sửa: hỗ trợ AbortSignal và giữ error.code; không đổi auth |
| frontend/src/style.css | Sửa: CSS cục bộ cho form/kết quả RAG và màn hình nhỏ |
| backend/tests/stage5-5-browser.cjs | Mới: kiểm thử browser, mock lỗi/role, hai request backend thật với tối đa một request Gemini |
| backend/tests/stage5-5-regression.cjs | Mới: chạy test cũ, build, secret review, snapshot và khôi phục báo cáo cũ |
| docs/giai-doan-5-5.md | Mới: báo cáo này |
| docs/stage5-5-results.json | Mới: kết quả kiểm thử và tích hợp thực tế |
| README.md | Sửa: tiến độ, cách sử dụng và kiểm thử giao diện |

Không thêm dependency ứng dụng. Playwright của bộ test cũ không còn trong thư mục tạm nên được cài lại tại thư mục tạm it-support-browser-check; Edge headless sử dụng trình duyệt đã có trên máy. node_modules/cache/dist không commit.

## 4. Luồng giao diện

Đăng nhập → chọn **Trợ lý CNTT** → nhập câu hỏi → **Gửi câu hỏi** hoặc Enter. Shift+Enter xuống dòng; Enter khi đang nhập IME không gửi. Trim trước POST, không gửi rỗng/whitespace, đếm tối đa 1000 Unicode code point trên chuỗi sẽ gửi, đồng bộ validation API. Không dùng maxLength UTF-16 làm lệch giới hạn emoji. Backend vẫn quyết định giới hạn 512 token embedding và kiểm tra secret.

Khi chờ: disable input/nút và hiển thị “Đang tìm kiếm thông tin và tạo câu trả lời...”. Ref khóa request ngay trước await để chặn cả submit liên tiếp trước render. Gửi câu mới xóa kết quả cũ, lỗi có thể sửa câu hỏi và gửi lại thủ công; không tự retry. Timeout chờ browser 65 giây; rời giao diện hủy fetch và bỏ kết quả muộn. Hủy fetch không bảo đảm hủy tác vụ/Gemini đã bắt đầu tại server.

## 5. Phân quyền

Ba role EMPLOYEE/IT/ADMIN đều thấy mục Trợ lý CNTT và dùng JWT hiện tại. Backend GĐ5.4 tiếp tục kiểm tra user ACTIVE và role; frontend không tạo cơ chế xác thực mới. HTTP 401 xóa session theo logout hiện tại và về màn hình đăng nhập với thông báo an toàn. Role IT/ADMIN không có nút tạo Ticket vì API hiện chỉ cho EMPLOYEE POST /api/tickets.

## 6. Answer và nguồn

Contract thật khi HTTP 200: answered (boolean), answer (string), sources (array). Mỗi source có code, title, score; không có article ID hoặc evidence trong response công khai. UI kiểm tra kiểu dữ liệu cơ bản và điều kiện nguồn; response sai contract được báo lỗi, không crash hoặc sinh nội dung thay thế.

Hiển thị câu hỏi đã gửi, text answer với white-space: pre-wrap, code/title của đúng sources trả về. Không hiển thị score như độ tin cậy; không tự dựng liên kết bài khi chưa có ID trong contract. React render text, không dùng dangerouslySetInnerHTML/HTML từ model; test chứa img/script trong cả answer/title không tạo phần tử hoặc chạy script.

## 7. Fallback và giới hạn phân biệt nguyên nhân

answered=false hiển thị tiêu đề “Chưa đủ thông tin trong Kho kiến thức” cùng nguyên văn answer từ backend, không có nguồn giả. Kết quả cũ không còn xuất hiện sau request mới/fallback.

API GĐ5.4 không trả reason công khai: dưới threshold, Gemini nhận thiếu context và fallback chủ động dùng chung contract. Vì vậy UI không thể và không tự đoán ba nguyên nhân này. Đây là giới hạn quan sát, đã ghi rõ thay vì thay API/thuật toán ngoài phạm vi. Lỗi kiểm chứng evidence/output dùng HTTP 502 và code tương ứng, được hiển thị như lỗi xác minh, tách khỏi fallback HTTP 200.

## 8. Liên kết RAG → Ticket

Đã đọc ticketRoutes.js: POST /api/tickets chỉ cho EMPLOYEE. Khi fallback, chỉ EMPLOYEE thấy **Tạo yêu cầu hỗ trợ**. Nút chuyển sang mục Ticket hiện có; người dùng chọn **Tạo yêu cầu**, điền form và chủ động **Gửi yêu cầu**. Không tự điền/gửi hoặc tự tạo Ticket, không đổi workflow/quyền. Test mở tới form hiện tại và xác nhận thao tác điều hướng phát sinh 0 POST /tickets.

## 9. Xử lý lỗi

| HTTP/code | Hành vi UI |
| --- | --- |
| 400 | Đề nghị rút gọn/kiểm tra câu hỏi, không nhập bí mật |
| 401 | Xóa phiên, về login |
| 403 | Thông báo không có quyền |
| 404 | Không tìm thấy chức năng |
| 429/RAG_BUSY | Đợi rồi gửi lại |
| 503/GEMINI_RATE_LIMIT | Hết hạn mức/giới hạn lượt gọi, thử lại sau |
| 502/GEMINI_INVALID_EVIDENCE, INVALID_OUTPUT, EMPTY, INCOMPLETE | Chưa xác minh được câu trả lời |
| 500/502/503 khác | Dịch vụ tạm thời không khả dụng |
| 504 hoặc browser AbortError | Quá thời gian chờ |
| Network error | Kiểm tra kết nối và thử lại |

RAG UI dùng thông báo cố định theo status/code, không hiển thị raw message/stack/config/provider diagnostic. Không biến lỗi thành answer thành công. Bộ browser mô phỏng các lỗi provider để không đốt quota hoặc thay key; HTTP 504 đã kiểm tra, nhánh timer 65 giây chưa chạy chờ hết thật.

## 10. Security review

Rà soát repository được Git theo dõi và file mới, so sánh byte với giá trị secret local trong runtime mà không in chúng, kiểm tra pattern key/JWT, kiểm tra bundle build. Không phát hiện key/token/password thật trong phạm vi quét. backend/.env vẫn được git check-ignore xác nhận; chỉ .env.example mẫu đã tồn tại. Frontend không có GEMINI_API_KEY, SDK Gemini hoặc gọi Google trực tiếp; theo dõi network browser không thấy request provider. Backend vẫn giữ trách nhiệm chống secret và xác minh nguồn.

Không commit cache model/vector dump, dependency artifact, báo cáo tạm hoặc screenshot tạm. Review này là kiểm tra ở phạm vi đồ án local, không thay thế pentest/DLP; không chứng minh mọi prompt injection hay mọi dữ liệu nhạy cảm tùy ý đều được chặn.

## 11. Responsive và quan sát giao diện

Kiểm thử desktop 1280×900 và mobile 390×844. Form, nút, text nhiều dòng và title nguồn dài không tràn ngang. Đã xem ảnh render desktop và mobile sau test; hình dạng đồng nhất Ticket/KB hiện tại, không thêm UI framework. Ảnh tạm stage5-5-desktop.png (answer thật) và stage5-5-mobile.png (fixture text dài) ở thư mục tạm hệ điều hành, không phải artifact bắt buộc trong Git.

## 12. Kết quả test GĐ5.5 và request thật

**34/34 browser tests PASS**. Login/JWT dùng tài khoản demo thật cả ba role. Phần trạng thái UI, lỗi, XSS và câu hỏi của IT/ADMIN dùng mock response trên route trình duyệt, được đánh dấu trong JSON. Không báo những mock này là các lần Gemini thật.

Hai request từ browser qua backend thật:

| Request | HTTP | Kết quả | Số lần Gemini |
| --- | --- | --- | ---: |
| Nhân viên mới có bao nhiêu ngày nghỉ phép năm? | 200 | answered=false, sources=[]; retrieval thật dưới threshold | 0 |
| Không kết nối được Wi-Fi thì cần kiểm tra gì trước? | 200 | answered=true; nguồn KB-000008, score 0.9118783783852443 | 1 |

Answer thật: “Khi không kết nối được Wi-Fi, bạn cần kiểm tra xem Wi-Fi đã bật và chế độ máy bay đã tắt chưa, sau đó di chuyển đến vị trí có tín hiệu tốt hơn.” UI được so sánh trực tiếp với JSON response; không sửa answer. Số request Gemini thật **toàn GĐ5.5: 1**. Instrumentation chỉ đếm và chuyển nguyên lời gọi SDK; guard chặn lượt thứ hai trong mỗi lần browser test. Không chạy lại 24 câu GĐ5.4.

Các vấn đề môi trường/test đã xử lý: thiếu Playwright tạm (chưa chạy test); lần đầu cấu hình Vite 5185 không khớp CORS backend 5173 khiến login timeout. Đã sửa test dùng đúng 5173, không sửa CORS/backend. Lượt lỗi có 0 Gemini call và dữ liệu nguyên vẹn, lưu trong browser.previousAttempts; lượt cuối 34/34 PASS.

| Test | Nội dung | Chế độ | Kết quả |
| --- | --- | --- | --- |
| 1 | EMPLOYEE đăng nhập thật | REAL_LOGIN | PASS |
| 2 | EMPLOYEE thấy mục Trợ lý CNTT | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 3 | Mở giao diện hỏi đáp | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 4 | Rỗng và whitespace không gửi request | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 4b | Giới hạn 1000 code point, không cắt sai emoji | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 4c | Shift+Enter xuống dòng; IME Enter không gửi | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 5 | Gửi Enter, trim, body đúng và JWT hiện tại | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 6 | Loading, disable và chặn submit lặp | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 7 | Answer và câu hỏi hiển thị đúng; giữ xuống dòng | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 8 | Sources chỉ có code/title backend trả | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 10 | Fallback không giữ answer/nguồn cũ hoặc tự bịa | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 11 | EMPLOYEE sang Ticket, không tự POST tạo yêu cầu | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 12 | IT mở Trợ lý CNTT | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 13 | IT nhận answer; fallback không có nút tạo Ticket | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 14 | ADMIN mở Trợ lý CNTT | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 15 | ADMIN nhận answer; fallback không có nút tạo Ticket | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 16 | 401 xóa phiên, về login; không hiển thị raw lỗi | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 17 | Xử lý HTTP 403 / FORBIDDEN | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 18 | Xử lý HTTP 429 / RAG_BUSY | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 19 | Xử lý HTTP 500 / RAG_ERROR | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| E400 | Xử lý HTTP 400 / INVALID_QUESTION | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| E404 | Xử lý HTTP 404 / NOT_FOUND | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| E503 | Xử lý HTTP 503 / GEMINI_RATE_LIMIT | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| E502 | Xử lý HTTP 502 / GEMINI_INVALID_EVIDENCE | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| E504 | Xử lý HTTP 504 / GEMINI_TIMEOUT | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 20 | Network error và gửi lại sau lỗi | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| EJSON | Response sai contract không crash hoặc tự tạo answer | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 23 | Answer và source được render text, không thực thi HTML | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 25 | Màn hình 390px không tràn; form và nguồn đọc được | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| LIFECYCLE | Chuyển tab khi request đang chạy không làm rò kết quả | BROWSER_REAL_AUTH_MOCK_RAG | PASS |
| 9 | Ngoài KB: browser → backend/retrieval thật → fallback, không Gemini | REAL_BACKEND_RETRIEVAL | PASS |
| 29 | Browser → API JWT → retrieval → Gemini thật → answer/sources | REAL_GEMINI | PASS |
| 22 | Browser không gọi Google/Gemini trực tiếp | BROWSER_REQUEST_OBSERVATION | PASS |
| RUNTIME | Không có lỗi JavaScript frontend | BROWSER_REAL_AUTH_MOCK_RAG | PASS |

## 13. Regression và build

| Bộ kiểm thử chạy lại | Kết quả |
| --- | --- |
| GĐ5.4 logic/API, Gemini mock | 23/23 PASS |
| stage4-2-api.cjs | 30/30 PASS |
| stage4-2-regression.cjs | 53/53 PASS |
| stage2-browser.cjs | 7/7 PASS |
| stage3-browser.cjs | 5/5 PASS |
| stage4-4-browser.cjs | 39/39 PASS |
| Frontend build (Vite production) | PASS |

Tổng regression API nghiệp vụ 83 (Auth/users/JWT/RBAC 23, Ticket 30, KB 30); browser cũ 51 (login 7, Ticket 5, KB 39); RAG GĐ5.4 logic/API mock 23. Các suite tổng hợp lỗi thời yêu cầu “chưa có RAG” không được dùng; runner gọi trực tiếp những suite phù hợp. Không gọi lại experiment Gemini. Report cũ và screenshot Ticket được backup/khôi phục nguyên byte sau regression; hash GĐ5.3/GĐ5.4 lưu ở JSON.

Chạy từ backend, sau khi cấu hình MySQL và backend/.env local như README, Edge/Playwright tạm sẵn có, cổng 5173 trống:

~~~powershell
node tests/stage5-5-regression.cjs
~~~

Lệnh mặc định chạy browser với tối đa một Gemini request thật rồi regression/build/security; có thể phát sinh quota/chi phí. Khi vừa chạy riêng node tests/stage5-5-browser.cjs PASS trên đúng source hiện tại, dùng node tests/stage5-5-regression.cjs --reuse-browser để dùng lại báo cáo tạm và không gọi thêm Gemini. Chỉ dùng reuse khi source không đổi; runner không tự xác nhận báo cáo cache thuộc commit nào. --mock-only của browser bỏ bước answer Gemini thật nhưng vẫn chạy backend/retrieval thật cho fallback; không đủ điều kiện nghiệm thu tích hợp thật nếu chạy riêng chế độ này.

Kết quả browser tạm ở backend/.cache/rag/stage5-5-browser.json (Git ignore); kết quả tổng hợp chính ở docs/stage5-5-results.json. Không chạy đồng thời với người chỉnh dữ liệu. Không cần seed lại; một số regression cũ kiểm tra tính lặp lại của seed hiện có nhưng không sửa bản ghi gốc.

## 14. Database trước/sau

| Bảng | Trước | Sau |
| --- | ---: | ---: |
| users | 3 | 3 |
| tickets | 3 | 3 |
| ticket_history | 17 | 17 |
| knowledge_articles | 8 | 8 |

8 bài vẫn PUBLISHED. Browser RAG không ghi nghiệp vụ. Regression cũ tạo/sửa bản ghi test tạm theo cơ chế đã có; runner dọn Ticket browser mới sau khi đối chiếu id/code/title/creator, không xóa bản ghi cũ. So sánh deep equality toàn bộ cột/dòng trước/sau, không chỉ số lượng. AUTO_INCREMENT có thể tăng khi tạo/dọn dữ liệu test, không reset; không đổi schema.

## 15. Hạn chế và điểm dừng

Corpus chỉ 8 bài demo; vector/index trong RAM; threshold xuất phát từ dataset nhỏ; chất lượng phụ thuộc KB, provider/quota/network. Các hạn chế GĐ5.4 vẫn còn: B03/B07 false negative, A03/C01 evidence quá dài, B01 khẳng định thiếu căn cứ, C03 chưa làm rõ; B05 có nguồn đúng ở rank 2. GĐ5.5 không chữa/che các kết quả đó.

Không có chat memory, streaming hoặc lưu hội thoại vào MySQL/localStorage. Chỉ một kết quả hiện tại, chuyển tab sẽ mất trạng thái. Không có deep link KB vì contract nguồn không có ID; fallback không tách được nguyên nhân nội bộ. Request Gemini thật chỉ một câu chứng minh đường tích hợp, không đo lại chất lượng hoặc độ ổn định trên toàn dataset. Timeout browser không bảo đảm dừng chi phí provider đã phát sinh.

Đã hoàn thành GĐ5.5 ở phạm vi giao diện và kiểm thử tích hợp. Dừng sau commit/push; không triển khai GĐ5.6 hoặc thay RAG.
