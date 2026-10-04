# Giai đoạn 6.4 – Hoàn thiện bản demo cuối và kiểm chứng hệ thống

## 1. Mục tiêu

Kiểm chứng phạm vi demo cuối, bảo toàn dữ liệu, chuẩn bị kịch bản 7–10 phút và minh chứng có nguồn gốc rõ. Kết quả máy đọc: [stage6-4-results.json](stage6-4-results.json). Không dùng số lượng test PASS để kết luận chất lượng mọi câu trả lời RAG.

## 2. Baseline

Trước thay đổi: working tree sạch, nhánh `main`; HEAD = origin/main = `7a62e66aee65a752b17bf335bd935abe21f8536c`, message `fix: harden system before final demo`. Đã đọc README, báo cáo GĐ5.6/6.1/6.2/6.3, JSON GĐ6.3 và runner/code liên quan.

## 3. Phạm vi và đối chiếu code

Chỉ thêm test UI đọc dữ liệu, tài liệu, JSON và ảnh; cập nhật tối thiểu README. Không sửa source ứng dụng, schema, dependency, workflow, retrieval, threshold, embedding hay Gemini model. Các mô tả evidence 500 ký tự và thiếu guard ADMIN trong GĐ5.6/6.1/6.2 là lịch sử trước fix: code hiện tại kiểm toàn quote rồi rút excerpt và đã bảo vệ ADMIN cuối. Không viết lại lịch sử.

## 4. Môi trường

Windows, Node `v22.17.1`, npm `10.9.2`, Edge headless, Playwright `1.63.0` tại thư mục tạm theo README. `npm ls --depth=0` backend/frontend exit 0, đủ dependency trực tiếp. Backend có ba package extraneous (`@emnapi/runtime`, `@img/sharp-wasm32`, `tslib`); không tự dọn/cài lại vì không cần cho phạm vi này. MySQL connection, backend health và DB health PASS trong regression. Frontend build PASS.

GEMINI_API_KEY, JWT_SECRET, SEED_USER_PASSWORD, DB_PASSWORD: **SET**, chỉ kiểm trạng thái. E5 cần truy cập mạng ở môi trường này ngay cả khi đã có cache; kiểm trong sandbox trả `fetch failed`, ngoài sandbox tải thành công. Không đổi model/cache/config để vượt lỗi; không gọi Gemini thật.

## 5. Database trước

Database local `it_support_rag`: **3 users / 3 tickets / 17 ticket_history / 8 knowledge_articles**, cả 8 PUBLISHED. Snapshot toàn bộ bản ghi chỉ giữ trong bộ nhớ; SHA-256 tổng:

`5c8540372ede9cc4f3279c23fb200daf99856f49d128b8daa7559961bc32c9c2`

Không lưu snapshot, password hash hay credential vào tài liệu.

## 6. Tài khoản demo

| Role | Trạng thái | Mục đích |
| --- | --- | --- |
| EMPLOYEE | ACTIVE | Tạo/xem Ticket của mình, đọc KB, dùng RAG |
| IT | ACTIVE | Tiếp nhận/xử lý Ticket, quản lý KB, dùng RAG |
| ADMIN | ACTIVE | Ticket/KB, Users API, bảo vệ ADMIN cuối, RAG |

Tài khoản seed hiện tại đủ dùng; không tạo thêm tài khoản demo lâu dài, không seed lại. User tạm của test đã dọn.

## 7. Flow A – EMPLOYEE

PASS: login, thông tin phiên, Ticket của mình, tạo NEW/LOW, detail/reload; chỉ đọc KB PUBLISHED, search Wi-Fi và detail; RAG có nguồn với provider mock, fallback ngoài KB với retrieval thật. Nút fallback chỉ chuyển mục Ticket, người dùng mở form và quyết định gửi/hủy; không có POST tự tạo Ticket.

## 8. Flow B – IT

PASS: login, xem/tiếp nhận Ticket, assignee đúng, priority LOW/MEDIUM/HIGH, workflow và solution, history; DRAFT/edit/PUBLISH/ARCHIVE/trở về DRAFT. RAG IT được kiểm trong browser GĐ5.5 (mock RAG, auth thật); retrieval thật được kiểm riêng trong E2E.

## 9. Flow C – ADMIN

PASS: profile, Ticket/KB theo quyền hiện hành; API Users và role/status trên fixture an toàn, token cũ phản ánh quyền mới. ADMIN cuối self-demote thành EMPLOYEE/IT hoặc INACTIVE đều 409; snapshot giữ nguyên. Ba race model/MySQL trên hai ADMIN tạm và rollback sau UPDATE PASS; không làm mất ADMIN gốc. ADMIN RAG có answer mock và fallback retrieval thật.

**ADMIN quản lý Users qua API; chưa có màn hình Users riêng.** Không thêm màn hình mới; không chụp header Authorization làm minh chứng.

## 10. Ticket workflow

`NEW → RECEIVED → IN_PROGRESS → RESOLVED → CLOSED`, và `RESOLVED → IN_PROGRESS`. PASS transition hợp lệ/sai, CLOSED chỉ đọc, solution bắt buộc, history đúng actor/thứ tự, rollback/concurrency và role/IDOR/assignee. Priority không tạo history trạng thái; đây là hành vi hiện tại.

## 11. Knowledge Base workflow

`DRAFT → PUBLISHED → ARCHIVED → DRAFT`. EMPLOYEE chỉ thấy PUBLISHED; IT/ADMIN quản lý theo quyền có sẵn. Search code/title trên frontend, trim/không phân biệt hoa thường; chưa bỏ dấu. Create/edit/detail/status PASS. Mười ca Unicode UI/API GĐ6.3 PASS: 255/256 code point, tiếng Việt, emoji, surrogate, combining marks và trim/edit.

## 12. RAG workflow

KB PUBLISHED → chunking → multilingual E5 local 384 chiều → vector RAM; question → query embedding → cosine retrieval → threshold/context → Gemini → evidence validation → answer/sources hoặc fallback. E2E dùng SDK mock có nhãn; các bước retrieval/E5/context/validator/API/MySQL/browser thật. Giữ `gemini-3.5-flash-lite`, threshold `0.8504602347669256`; không chạy lại benchmark 24 câu.

## 13. Fallback

Câu ngoài KB về ngày nghỉ phép: `answered=false`, sources rỗng, trace `BELOW_THRESHOLD`, provider không được gọi. Quan sát request/browser/database xác nhận không tự tạo Ticket. Lỗi provider/evidence được kiểm riêng bằng mock an toàn, không giả thành answer thành công.

## 14. Grounding/evidence

Logic 17/17 và replay API 4/4 trong integration PASS. A03/C01 hết lỗi quote dài về contract; toàn quote vẫn phải thuộc context trước rút excerpt. Suffix bịa sau 500 vẫn bị chặn. B01/C03 replay còn được validator chấp nhận; literal evidence chưa kiểm ý nghĩa mọi claim. **P2-01 vẫn MITIGATED**, không kết luận Gemini live đã cải thiện. **Gemini thật: 0 request**; 4 lần provider mock trong E2E/responsive, các suite khác có mock riêng.

## 15. Responsive/UI

E2E **8/8**: Login, Ticket, KB, RAG answer/sources tại **1280px và 390px**. Bổ sung **12/12**: Login, Ticket list, form chưa gửi, detail/history, KB detail, editor chưa lưu với Unicode/text dài tại cả hai kích thước. Hai bộ có màn hình trùng nên báo riêng, không diễn giải là 20 màn hình khác nhau.

Không tràn ngang trang; input/button được kiểm nằm trong viewport ở runner bổ sung. Bảng Ticket có vùng cuộn riêng theo CSS hiện tại. Navigation, loading, error, fallback, source, text dài và Unicode được kiểm qua E2E/browser regression. Đã xem trực tiếp cả 12 ảnh mới; không cần sửa/redesign UI. Chưa kiểm mọi thiết bị/trình duyệt hoặc accessibility chuyên sâu.

## 16. Session/error handling

PASS login/reload/logout, JWT thiếu/sai/hết hạn/sai chữ ký, role/status runtime; 401/403/404/409. Loading/chặn submit lặp, lỗi 500/502/503/504, network error và feedback/gửi lại được kiểm bằng mock có nhãn. Không làm hỏng server/database thật để tạo lỗi. Logout chưa thu hồi JWT ở server là giới hạn cũ.

## 17. Final regression và cách chạy

Lượt integration hoàn chỉnh mới: **2026-10-04T15:44:22.741Z → 2026-10-04T15:45:36.427Z**, exit 0.

| Nhóm | PASS |
| --- | --- |
| Logic/replay GĐ6.3 | 17/17 |
| Integration riêng GĐ6.3: ADMIN, Unicode, replay HTTP | 24/24 |
| E2E nghiệp vụ | 10/10 flow, 28/28 bước |
| Responsive E2E | 8/8 |
| UI bổ sung GĐ6.4 | 12/12 |
| Auth/JWT/RBAC/Users fixture | 14/14 |
| Ticket API | 30/30 |
| Knowledge API | 30/30 |
| RAG GĐ5.2 logic | 8/8 |
| RAG GĐ5.3 logic | 17/17 |
| RAG GĐ5.4 logic/API mock | 16/16 + 7/7 |
| Browser Auth/Ticket/KB/RAG | 7/7 + 5/5 + 39/39 + 33/33 |
| Tổng regression (không gồm các nhóm E2E/GĐ6.3/UI bổ sung) | **206/206** |
| Frontend build | PASS |

Trong `backend`, chạy tuần tự khi DB đúng baseline và không có người sửa dữ liệu:

```powershell
node tests/stage6-3-integration.cjs
node tests/stage6-4-ui.cjs
```

Lệnh đầu đã bao gồm logic GĐ6.3, E2E, các regression trên và build. Giữ nguyên adaptation trong runner GĐ6.3: bỏ assertion bug lịch sử reviewP2, thay bằng tests fix; report/ảnh vào cache, giữ báo cáo cũ nguyên byte. Không sửa assertion nghiệp vụ để PASS. Auth dùng 14 nhóm fixture thay script cũ vốn sửa user gốc; GĐ5.2/5.3 chạy logic và E5 trong E2E, không gọi lại toàn bộ experiment lịch sử. Browser GĐ5.5 dùng `--mock-only`, không gọi ca Gemini thật.

Lệnh UI bổ sung chỉ đọc DB, nhập form nhưng không gửi, ghi cache JSON và sáu ảnh mới. Chạy test sẽ không tự cập nhật báo cáo tổng hợp đã duyệt này. Điều kiện dependency/Edge/Playwright/model/network theo README; chưa xác minh máy sạch.

## 18. Database integrity

Sau integration và UI bổ sung: **3 / 3 / 17 / 8**, 8 KB PUBLISHED. Deep equality và fingerprint trước/sau khớp giá trị mục 5; **0 fixture còn sót**. Không đổi bản ghi/timestamp gốc. AUTO_INCREMENT tăng do tạo/dọn fixture, không reset. Tất cả báo cáo/ảnh lịch sử được bảo toàn; không dùng output cache ngày 03/10 làm kết quả ngày 04/10.

## 19. Security review

Rà đường dẫn Git và nội dung thay đổi/bundle bằng giá trị secret runtime trong bộ nhớ cùng pattern API key/JWT/bcrypt. Không phát hiện secret/password/hash/credential thật trong phạm vi rà; `.env`, node_modules, dist, cache model/vector không đưa vào commit. Không in giá trị secret. Cả 12 ảnh đã xem, Login input rỗng; không ảnh password/JWT/.env. Không phải pentest, CVE scan hay audit toàn lịch sử Git.

## 20. Minh chứng

Tại [evidence/stage6-4](evidence/stage6-4/): 12 ảnh mới, không ảnh tổng hợp giả PASS. 01 Login; 02 Ticket list; 03 form chưa gửi; 04 IT processing; 05 history; 06 KB detail; 07 KB management; 08 RAG answer **MOCK**; 09 fallback **retrieval thật, không provider**; 10 mobile RAG **MOCK**; 11 mobile form chưa gửi; 12 mobile editor chưa lưu.

Sáu ảnh từ lượt E2E hoàn chỉnh ngày 04/10 được sao chép nguyên byte từ cache GĐ6.3, checksum lưu JSON; nhãn fixture `[E2E-6.2 ...]` là tên runner tái sử dụng, không phải ảnh cũ GĐ6.2. Sáu ảnh còn lại do runner UI GĐ6.4 chụp mới. Không tạo ảnh ADMIN giả: dùng assertion HTTP 409/DB trong JSON làm chứng cứ. Ảnh mock không chứng minh chất lượng Gemini live.

## 21. Các lỗi phát hiện trong lượt kiểm chứng

Hai lượt integration đầu **FAILED/INCOMPLETE**, không che giấu: 24 ca GĐ6.3 PASS nhưng child E2E dừng tại nhánh RAG trước báo cáo mới; lượt chẩn đoán có flow1–6 PASS, child exit 1. Kiểm riêng E5 trong sandbox trả `TypeError: fetch failed`. Pending request trong runner cũ không hoàn tất cleanup khi lỗi này xảy ra; đây là hạn chế hạ tầng test thuộc P2-03, không bằng chứng P0/P1 ứng dụng mới.

Mỗi lượt để lại 2 users + 1 Ticket/7 history + 1 KB tạm. Đã xác nhận chính xác marker/ID, cleanup bằng transaction và kiểm fingerprint gốc trước commit transaction: lượt 1 users 76/77, Ticket 136, KB 187; lượt 2 users 80/81, Ticket 137, KB 192. Không xóa theo khoảng ID hoặc khôi phục dump.

Sau cấp quyền mạng ngoài sandbox, E5 tải thành công; integration chạy lại đầy đủ PASS, tự cleanup và dispose model bình thường. Không sửa source/test cũ hoặc đổi cache/model để ép PASS. Lượt FAIL vẫn lưu tóm tắt trong JSON. Không phát hiện lỗi nghiệp vụ mới trong phạm vi hoàn chỉnh; không khẳng định runner chịu được mọi lỗi hạ tầng.

## 22. P2 còn MITIGATED

**P2-01:** prompt thận trọng hơn nhưng chưa chứng minh ngữ nghĩa/live; B01/C03 còn giới hạn. **P2-03:** chạy được môi trường hiện tại sau cấp mạng, chưa clean machine/CI; còn phụ thuộc browser/cache/network và cần cleanup có kiểm soát nếu child dừng bất thường. Không đổi thành FIXED. Ba P2 FIXED từ GĐ6.3 (evidence length, ADMIN cuối, Unicode) được kiểm lại PASS.

## 23. P3 còn lại

Bốn nhóm cũ giữ nguyên: quy mô/chất lượng retrieval; bảo vệ khi triển khai ngoài demo; UX/chức năng mở rộng; chất lượng đánh giá độc lập. Không mở rộng phạm vi. P0=0, P1=0 phát hiện mới; P2 FIXED=3, MITIGATED=2; P3=4 nhóm.

## 24. Hạn chế

Không kiểm Gemini live sau fix; kết quả lịch sử GĐ5.4 vẫn 14 answer/8 fallback/2 lỗi, groundedness 13 PASS/1 PARTIAL trên 14 answer. Corpus nhỏ; chưa đánh giá độc lập/máy sạch/tải lớn/production. Cache E5 không bảo đảm offline ở môi trường này. Test/mock không được quảng bá thành chất lượng model thật.

## 25. Demo readiness

**Hệ thống đạt trạng thái sẵn sàng cho phạm vi demo đã kiểm chứng.** Phạm vi: Ticket/KB/role/session trên API/MySQL/browser thật; pipeline RAG với E5 thật và Gemini mock; fallback thật; desktop/mobile đã nêu. Demo Gemini live phụ thuộc mạng/key/quota và chưa được smoke test mới. [Kịch bản khoảng 9 phút](giai-doan-6-4-demo-script.md) nêu rõ cách dùng ảnh mock/lịch sử và phương án khi provider lỗi.

## 26. Kết luận và Git

GĐ6.4 hoàn tất kiểm chứng, tài liệu và minh chứng trong phạm vi trên. Commit yêu cầu: `test: finalize demo readiness verification`; hash và remote được báo sau commit/push, không tự tham chiếu hash trong tài liệu. Giữ nguyên kiến trúc, schema, nghiệp vụ và số liệu lịch sử. Dừng sau GĐ6.4; không bắt đầu GĐ7 hoặc triển khai production.
