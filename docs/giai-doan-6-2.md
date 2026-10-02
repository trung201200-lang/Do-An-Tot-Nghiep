# Giai đoạn 6.2 – Kiểm thử End-to-End toàn hệ thống

## 1. Mục tiêu

Kiểm chứng các luồng người dùng trên hệ thống đã audit ở GĐ6.1, từ React qua Express đến MySQL, ghi nhận lỗi để xử lý sau. Kết quả từng bước: [stage6-2-results.json](stage6-2-results.json). Runner: [stage6-2-e2e.cjs](../backend/tests/stage6-2-e2e.cjs).

Lượt hoàn chỉnh: **2026-10-02T09:20:51.310Z → 2026-10-02T09:21:42.474Z**, exit code 0. **10/10 flow, 28/28 bước kiểm tra PASS**; kết quả regression, responsive và xác minh P2 được ghi riêng.

## 2. Phạm vi

Tạo một runner E2E, báo cáo Markdown/JSON và 9 ảnh minh chứng. Không sửa code nghiệp vụ, schema, README, dependency, model, chunking, retrieval, ngưỡng, prompt hoặc evidence validator. Không sửa năm P2; chưa bắt đầu GĐ6.3.

Luồng Ticket/KB/Auth dùng browser/API/MySQL thật. Negative authorization gọi API thật với JWT thật; không chỉ kiểm nút ẩn. Chỉ SDK generateContent được mock trong tiến trình test, cùng các response lỗi/empty/loading UI đã đánh dấu rõ. Không có request Gemini thật, không chạy lại experiment 24 câu.

## 3. Baseline GĐ6.1 và Git

Đã đọc giai-doan-6-1.md, stage6-1-results.json và giai-doan-6-2-ke-hoach.md. Git ban đầu main sạch, HEAD = origin/main = **bd3ee7b921397a2f6f05bb331b0b0b9f0c331269**, message **docs: add system audit and E2E baseline**; đã chạy status/status -sb/log -5/rev-parse.

GĐ6.1 có P0=0, P1=0, P2=5, P3=4 nhóm; baseline 215 test + 7 kiểm tra và build PASS là **lịch sử**, không cộng vào kết quả mới. Thứ tự FLOW 1–10 dưới đây theo prompt GĐ6.2 mới nhất; kế hoạch GĐ6.1 chỉ làm đầu vào, không thay workflow.

## 4. Môi trường kiểm thử

| Thành phần | Thực tế |
| --- | --- |
| Workspace | D:\DOANTOTNGHIEP |
| Node / OS | v22.17.1 / Windows |
| Browser | Microsoft Edge headless 154.0.4258.37 |
| Automation | Playwright 1.63.0 hiện có trong thư mục tạm it-support-browser-check/node_modules/playwright |
| Frontend | Vite tại http://127.0.0.1:5173, strictPort |
| Backend | Express app thật, cổng loopback động riêng cho test |
| Database | MySQL local, it_support_rag |
| Embedding | E5 local từ model/cache đã có, 384 chiều |
| Gemini | Mock tại SDK generateContent; 0 request mạng đến Gemini |

Không cài framework/dependency mới. Cách chạy từ backend:

~~~powershell
node tests/stage6-2-e2e.cjs
~~~

Cần MySQL, ba demo role ACTIVE, cấu hình runtime, model cache, Edge/Playwright hiện có và cổng 5173 trống. Runner kiểm dữ liệu demo ban đầu; nếu khác sẽ dừng, không ép lại. Không chạy đồng thời phiên sửa dữ liệu khác. Khi chạy lại, JSON/ảnh GĐ6.2 được cập nhật cho lượt mới; các trường phân loại lỗi/security thủ công cần được rà lại sau khi chạy, previousAttempts lưu kết quả đã ghi của lượt trước. Lệnh này tạo/dọn dữ liệu test tạm, không phải read-only.

## 5. Database trước test

users=3, tickets=3, ticket_history=17, knowledge_articles=8; cả 8 bài PUBLISHED. Snapshot toàn bộ trường/bản ghi nằm trong bộ nhớ, không xuất password/hash hoặc dump database vào báo cáo. So sánh deep equality sau cleanup và sau regression; không chỉ kiểm số lượng.

Ba user gốc và 3 Ticket/17 history/8 KB gốc không bị sửa hoặc xóa. Dữ liệu mới mang marker E2E-6.2 và UUID, ID/code được giữ trong runner để dọn đúng bản ghi. Không giả định ID bắt đầu từ 1.

## 6. Chiến lược E2E và bằng chứng

Browser chạy giao diện thật; ghi dữ liệu qua API nghiệp vụ, không SQL giả lập transition. SQL chỉ SELECT đối chiếu và cleanup test sau xác minh ID/code/creator/marker; cleanup theo transaction và thứ tự FK.

Provider mock vẫn đi qua createGeminiClient, generationService, E5/retrieval/context, evidence validator và route thật. Mock SDK trả response phù hợp contract, không mock response HTTP answer ở FLOW 7. Một barrier trong mock kiểm loading/chống gửi lặp. FLOW 8 dùng threshold thật, không chạm provider.

P2-01/02 phát lại output lịch sử B01/C03/A03/C01 qua provider mock; không đo lại chất lượng live. P2-04 chỉ gọi controller với model giả lập trong bộ nhớ, không khóa ADMIN thật. FLOW 10 có network mock riêng để kiểm lỗi UI/empty/delay; không tính các ca đó là API nghiệp vụ thật.

Ảnh tổng khoảng 0,76 MB, có SHA-256 trong JSON:

| Ảnh | Minh chứng |
| --- | --- |
| [01 Employee Ticket](evidence/stage6-2/01-employee-ticket.png) | NEW, creator và history đầu |
| [02 IT xử lý](evidence/stage6-2/02-it-processing.png) | IN_PROGRESS, HIGH, assignee/history |
| [03 RESOLVED](evidence/stage6-2/03-resolved-solution.png) | EMPLOYEE đọc solution |
| [04 Employee KB](evidence/stage6-2/04-employee-kb.png) | Bài seed PUBLISHED, không nút quản trị |
| [05 IT KB](evidence/stage6-2/05-it-kb.png) | Bài test DRAFT đã sửa |
| [06 RAG answer MOCK](evidence/stage6-2/06-rag-answer-mock.png) | Answer và source từ pipeline thật, provider mock |
| [07 Fallback](evidence/stage6-2/07-rag-fallback.png) | OUT threshold reject, sources rỗng |
| [08 Chuyển sang Ticket](evidence/stage6-2/08-fallback-ticket-form.png) | Form chưa gửi, người dùng quyết định |
| [09 Mobile](evidence/stage6-2/09-mobile-rag-mock.png) | Viewport 390px, nguồn đọc được |

Không chụp màn hình đang nhập mật khẩu, JWT, .env hoặc key. Nội dung trang được quét secret trước chụp; cả 9 ảnh cuối đã được xem lại.

## 7. FLOW 1 – Employee tạo Ticket

**PASS, 3 bước.** Login UI và role EMPLOYEE được xác minh từ response thật. Submit form rỗng bị HTML validation chặn, không phát sinh POST. Tạo Ticket tạm bằng UI trả 201, code TKT-000118 trong lượt cuối, created_by đúng EMPLOYEE, status NEW, priority LOW, assigned_to null.

List/detail/reload đều thấy Ticket; MySQL có cùng code/creator. History đầu old_status=null, new_status=NEW, actor_id đúng người tạo. Không dùng số liệu Ticket demo cũ để chấm PASS.

## 8. FLOW 2 – IT tiếp nhận

**PASS, 2 bước.** IT đăng nhập và thấy chính Ticket FLOW 1. UI tiếp nhận NEW→RECEIVED, assigned_to lấy từ IT hiện tại. Đổi priority MEDIUM→LOW→HIGH qua UI/API, sau đó RECEIVED→IN_PROGRESS.

History lúc này có đúng NEW/RECEIVED/IN_PROGRESS; hai history xử lý có actor_id là IT. Field thực tế là actor_id, không có changed_by trong schema. Priority không tạo history trạng thái. Không cập nhật status trực tiếp bằng SQL.

## 9. FLOW 3 – Xử lý/solution

**PASS, 4 bước.** UI chặn solution rỗng; PATCH RESOLVED thiếu solution trả 400 và detail/history giữ nguyên. Solution hợp lệ lưu thành công, status RESOLVED, history tăng đúng.

EMPLOYEE đăng xuất/đăng nhập lại, thấy solution và RESOLVED, không thấy nút tiếp nhận/xử lý lại/đóng. IT tiếp tục RESOLVED→IN_PROGRESS→RESOLVED→CLOSED. Bảy history đúng thứ tự; CLOSED→IN_PROGRESS trả 409, không đổi bản ghi. EMPLOYEE không có quyền đóng Ticket theo code thật.

Transaction/rollback được kiểm thêm bằng suite Ticket API 30 ca, trong đó có kiểm rollback khi ghi history lỗi. E2E xác minh tính nhất quán trạng thái/history qua UI/API; không tuyên bố chỉ đếm history là đủ chứng minh mọi lỗi transaction.

## 10. FLOW 4 – Ticket RBAC

**PASS, 3 bước.** Tạo đúng hai user tạm EMPLOYEE/IT để kiểm bản ghi người khác, không đổi role user gốc.

EMPLOYEE gọi accept/priority/status bị 403; tạo Ticket kèm assigned_to bị 400. EMPLOYEE khác không list/detail Ticket FLOW 1; detail trả 403. IT khác bị 403 khi đổi priority/status Ticket gán IT ban đầu, kể cả ca Ticket đang RECEIVED ở FLOW 9. Không token→401; ID không tồn tại→404; IT/ADMIN POST tạo Ticket→403. Dữ liệu Ticket đã kiểm không đổi sau request bị từ chối.

## 11. FLOW 5 – Knowledge Base

**PASS, 3 bước.** EMPLOYEE thấy 8 PUBLISHED, tìm Wi-Fi bằng chuỗi trim/khác hoa thường, mở detail đọc đúng content; không có nút tạo/sửa.

IT tạo bài test KB-000156 DRAFT, sửa title/content bằng UI; code/created_by giữ nguyên, updated_by là IT. Xuất bản PUBLISHED khiến EMPLOYEE thấy bài; ARCHIVED khiến bài biến mất và direct detail 403; IT chuyển lại DRAFT. Không sửa 8 bài seed.

## 12. FLOW 6 – KB RBAC

**PASS, 2 bước.** EMPLOYEE POST tạo, PUT sửa, PATCH status và đọc DRAFT đều bị backend 403. ADMIN sửa bài test do IT tạo: giữ creator/code, updated_by là ADMIN. IT đã kiểm đủ thao tác quản trị bằng UI ở FLOW 5; không suy quyền chỉ từ nút hiển thị.

## 13. FLOW 7 – RAG có nguồn

**PASS, 2 bước, MOCK provider.** EMPLOYEE hỏi Wi-Fi; browser gọi backend thật, E5/retrieval/context/evidence đều thật. Trong lúc mock provider bị giữ, input/nút gửi disabled, có loading và submit lặp không gọi provider lần hai.

Response đúng ba trường answered/answer/sources, source thuộc PUBLISHED gốc; UI hiển thị đúng answer và code/title. Ảnh đánh dấu [MOCK Gemini], không trình bày là Gemini live. Không lộ raw provider/trace, không tự thêm Ticket và không browser gọi Google trực tiếp.

PASS ở đây xác minh luồng tích hợp với provider mock, **không chứng minh mọi câu trả lời Gemini đều grounded**; P2-01 vẫn tồn tại.

## 14. FLOW 8 – RAG fallback → Ticket

**PASS, 2 bước, retrieval thật không provider.** Câu hỏi ngày nghỉ phép bị threshold reject; answered=false, sources=[], không thêm lượt mock provider và 0 Gemini thật. Không tạo Ticket tự động.

EMPLOYEE bấm Tạo yêu cầu hỗ trợ → vào mục Ticket; chọn Tạo yêu cầu → form rỗng. Trước khi gửi, số POST /tickets không tăng; test chọn Hủy và không tạo bản ghi mới. Hành vi này đúng GĐ6.1: nút RAG chưa mở trực tiếp form, người dùng còn chọn Tạo yêu cầu.

**RAG hỗ trợ tra cứu tri thức. Ticket là yêu cầu hỗ trợ chính thức. Fallback RAG không đồng nghĩa hệ thống tự tạo Ticket.**

## 15. FLOW 9 – ADMIN

**PASS, 3 bước.** /auth/me trả ADMIN; UI đọc Ticket CLOSED/history và có chức năng sửa/xuất bản KB. ADMIN không có nút tạo Ticket.

Tạo thêm Ticket tạm TKT-000119 qua EMPLOYEE API, IT tiếp nhận, IT khác bị chặn; ADMIN đổi priority và chuyển IN_PROGRESS thành công, history actor_id là ADMIN, assigned_to vẫn IT. User API GET /users hoạt động và không lộ mật khẩu.

Backend API available; dedicated frontend management screen not implemented. Nghĩa là có API quản lý user, chưa có màn hình quản trị riêng; không tính là bug ngoài phạm vi.

ADMIN dùng RAG answer mock/fallback thật; không có nút tạo Ticket trên fallback.

## 16. FLOW 10 – Session/error

**PASS, 4 bước.** Reload giữ phiên; logout xóa token/session và protected navigation. Token invalid/expired được backend trả 401, UI trở về login. INACTIVE kiểm trên EMPLOYEE tạm: cả login và token đã cấp bị 401; đưa user tạm về ACTIVE rồi cleanup.

Các trạng thái UI 403/404/500 được network mock có đánh dấu; 500 không hiển thị raw diagnostic. Empty response hiện thông báo rỗng; delay response hiển thị loading, sau thả barrier tải dữ liệu thật. Backend negative thật đã kiểm ở FLOW 4/6 và regression. Không cố làm server/MySQL thật hỏng để tạo 500.

## 17. Responsive

**8/8 PASS**: Login, Ticket, KB và RAG answer/sources ở 1280px và 390px. document.scrollWidth không vượt viewport; vùng chính/input nằm trong chiều ngang, navigation ba nút và thao tác hỏi RAG dùng được. Ảnh mobile thể hiện answer/source xuống dòng.

Đây là kiểm tra bố cục trên Edge và hai viewport nêu trên, không phải chứng nhận mọi thiết bị hoặc audit accessibility toàn diện. Không phát hiện overflow nghiêm trọng trong các màn hình đã kiểm.

## 18. Kiểm tra năm P2 cũ

| P2 | Cách xác minh mới | Ảnh hưởng và kết luận |
| --- | --- | --- |
| P2-01 Grounding/mơ hồ | Phát lại B01/C03 từ output GĐ5.4 qua SDK mock, retrieval/context/validator thật; answer cũ vẫn hiển thị | Tái hiện giới hạn nội dung, không crash/RBAC sai. Demo cần nói rõ giới hạn; giữ P2, không có kết quả Gemini mới |
| P2-02 Evidence quá dài | Phát lại A03/C01 qua provider mock | HTTP 502 GEMINI_INVALID_EVIDENCE; UI báo chưa xác minh, không trả answer giả. Có thể không trả lời được câu đó; giữ P2 |
| P2-03 Tái lập test | Chạy runner mới, kiểm dependency/cổng/cache và không dùng reuse-browser | Môi trường này chạy được; máy sạch/CI chưa kiểm. Runner được lưu nhưng chưa giải quyết tính portable; giữ P2 |
| P2-04 ADMIN cuối | Controller thật với model giả lập trong bộ nhớ nhận self-demote/INACTIVE | Tái hiện thiếu guard ở tầng controller; không phải E2E mất ADMIN thật. Không khóa user gốc; cần chốt chính sách, giữ P2 |
| P2-05 Unicode title | Keyboard thật nhập title ngoài BMP; POST API thật trên bài tạm | UI giữ 255 UTF-16, API nhận đủ 279 UTF-16 = 149 code point. Tái hiện khác biệt, tiếng Việt BMP thông thường không ảnh hưởng; giữ P2 |

Không đổi năm P2 thành PASS chất lượng hoặc tuyên bố đã sửa. JSON có expected/actual, mode, tác động E2E/demo và mức độ từng mục.

## 19. Regression

**206/206 ca PASS**, chạy mới sau E2E, tách khỏi 10 flow/28 bước và 8 responsive:

| Suite | Kết quả |
| --- | --- |
| Auth/JWT/RBAC/Users với user tạm | 14/14 |
| Ticket API cũ | 30/30 |
| KB API cũ | 30/30 |
| RAG GĐ5.2 logic | 8/8 |
| RAG GĐ5.3 logic | 17/17 |
| RAG GĐ5.4 logic | 16/16 |
| RAG GĐ5.4 API mock | 7/7 |
| Browser Auth cũ | 7/7 |
| Browser Ticket cũ | 5/5 |
| Browser KB cũ | 39/39 |
| Browser RAG cũ --mock-only | 33/33 |

**206 không phải 215 của GĐ6.1.** Không gọi nguyên stage2-api.cjs vì script đó đổi status và cập nhật timestamp user gốc; thay bằng 14 nhóm assertion mới trên user tạm, vẫn kiểm login/me ba role, bcrypt, password sai, JWT thiếu/sai/hết hạn, ma trận RBAC, tạo/trùng/đổi role/status/INACTIVE/validation Users và Health/DB health. Cách chia nhóm test khác; không dùng chênh lệch số test làm metric độ phủ.

Suite Ticket/browser cũ để lại demo mới được wrapper dọn theo ID/code/title/creator sau đối chiếu snapshot; không dọn dữ liệu có sẵn. JSON/PNG cũ được phục hồi nguyên byte. Không chạy seed, không experiment 24 câu và không gọi Gemini thật hàng loạt.

## 20. Frontend build

PASS bằng node node_modules/vite/bin/vite.js build trong frontend, tương đương script Vite build hiện có. Không sửa package/lockfile hoặc đưa dist vào Git.

## 21. Database sau test

| Bảng/trạng thái | Trước | Sau E2E cleanup | Sau regression |
| --- | --- | --- | --- |
| users | 3 | 3 | 3 |
| tickets | 3 | 3 | 3 |
| ticket_history | 17 | 17 | 17 |
| knowledge_articles | 8 | 8 | 8 |
| KB PUBLISHED | 8 | 8 | 8 |

So sánh toàn bộ cột/bản ghi: PASS. Cleanup PASS, không còn dữ liệu tạm. Lượt cuối có ba user tạm ID 62/63/64 (hai E2E, một Auth regression), Ticket 118/119, KB 156/157; tất cả đã dọn. Suite regression cũ còn có fixture riêng được tự cleanup/wrapper dọn; không coi danh sách này là toàn bộ fixture nội bộ mọi suite.

Không sửa/xóa ba user gốc, ba Ticket gốc, 17 history gốc hoặc tám KB gốc. AUTO_INCREMENT tiến do test, không reset; code có thể nhảy số. Không đổi schema.

## 22. Security

Rà file mới, Git hiện tại, bundle và ảnh; so sánh giá trị secret local trong bộ nhớ và pattern key/JWT, không in giá trị. .env thật, key, JWT thật, mật khẩu, DB password, model cache, dist, node_modules trong phạm vi commit: **NOT FOUND**.

Cả 9 screenshot đã được xem, chỉ có dữ liệu demo/test và nội dung KB demo; không có input password, token hoặc env. Test không serialize login response/token vào report; thông báo lỗi runner chỉ giữ loại lỗi hoặc HTTP status đã loại dữ liệu nhạy cảm. Không đưa snapshot DB nhạy cảm vào JSON. Đây là review phạm vi thay đổi, không phải quét toàn lịch sử Git/CVE/pentest.

## 23. Các lỗi phát hiện và lỗi runner

Không phát hiện lỗi nghiệp vụ mới trong 10 flow; **không sửa source để làm test PASS**. Năm P2 tồn tại được xác minh như mục 18.

Trong lúc xây dựng runner, hai lượt đầu không hoàn tất xuất report vì hàm stopBrowser chờ sự kiện exit lần nữa của Vite đã dừng. Tiến trình con bị kết thúc bằng signal nên exitCode còn null; đã sửa riêng runner để kiểm signalCode và xóa tham chiếu sau khi dừng. Không liên quan Gemini/ONNX hoặc lỗi ứng dụng. Dữ liệu đã cleanup; hai PNG lịch sử do regression ghi được khôi phục nguyên byte trước chạy lại.

Lượt đầu chỉ có log tiến trình; lượt thứ hai đã có checkpoint, giữ trong previousAttempts với completed=false. Không coi hai lượt đó là lượt hoàn chỉnh. Lượt hoàn chỉnh trước được giữ trong previousAttempts. Khi rà soát cuối, đã loại report/ảnh GĐ6.2 khỏi danh sách artifact lịch sử cần khôi phục để tránh ghi đè bằng chứng khi chạy lại sau commit. Lượt cuối dùng runner đã chỉnh, chạy lại E2E/regression/build đầy đủ, đóng HTTP/model bình thường (CLOSED/DISPOSED), exit 0. Không có timeout model ở lượt cuối. Đây là lỗi hạ tầng test đã xử lý trong file mới, không phải sửa P2-03 về tính portable.

## 24. P0/P1/P2/P3

- P0: **0**.
- P1: **0**.
- P2: **5 vấn đề cũ**, không nâng mức khi chưa có bằng chứng; không có P2 nghiệp vụ mới.
- P3: **4 nhóm cũ**: quy mô/chất lượng retrieval; bảo vệ khi triển khai; UX/chức năng mở rộng; đánh giá độc lập.
- Lỗi nghiệp vụ mới: **0 trong phạm vi đã kiểm**.
- Lỗi hạ tầng runner chưa xử lý ở lượt cuối: **0**.

PASS flow không xóa giới hạn nội dung RAG đã tái hiện hoặc biến mô phỏng ADMIN cuối thành thử nghiệm mất quyền thật. Không kết luận hệ thống đã sẵn sàng production.

## 25. Đề xuất GĐ6.3

Chỉ đề xuất, chưa thực hiện:

1. Chốt quy tắc bảo vệ ADMIN ACTIVE cuối trước khi sửa và kiểm bằng user tạm/mô phỏng an toàn.
2. Thống nhất giới hạn title Unicode UI/API và thông báo validation.
3. Làm rõ cách tái lập môi trường test, dependency/cache/cổng và provenance; không xóa báo cáo lịch sử.
4. Xem xét xử lý grounding/mơ hồ và evidence dài theo phạm vi được phê duyệt; không nới ngưỡng hoặc đổi nhãn trên TEST cũ để cải thiện điểm.
5. Giữ P3 ngoài phạm vi hoàn thiện nếu chưa có yêu cầu mới.

## 26. Kết luận

GĐ6.2 hoàn tất kiểm chứng với **10/10 flow (28/28 bước), 8/8 responsive, 206/206 regression và build PASS**; không cộng các loại này thành metric chất lượng RAG. Gemini thật: **0 request**; mock SDK: 8 lượt trong E2E/xác minh P2/responsive. Dữ liệu và báo cáo cũ bảo toàn; chỉ tạo runner, Markdown/JSON và 9 ảnh GĐ6.2.

Commit theo yêu cầu: **test: add end-to-end system verification**; chỉ stage file GĐ6.2 sau review. Hash commit và xác nhận remote được báo sau push để tránh hash tự tham chiếu trong tài liệu. **Dừng sau GĐ6.2, chưa sửa các P2 và chưa bắt đầu GĐ6.3.**
