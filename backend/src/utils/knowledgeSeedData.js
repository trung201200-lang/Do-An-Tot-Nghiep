// Dữ liệu demo cho đồ án, không phải quy trình chính thức của doanh nghiệp.
const articles = [
  {
    key: 'wifi', title: 'Không kết nối được Wi-Fi',
    content: `Hiện tượng
Máy tính không nhìn thấy mạng Wi-Fi, không kết nối được hoặc báo đã kết nối nhưng không truy cập được tài nguyên cần dùng.

Nguyên nhân thường gặp
Wi-Fi trên thiết bị bị tắt, chế độ máy bay đang bật, tín hiệu yếu hoặc cấu hình kết nối đã lưu không còn phù hợp. Sự cố cũng có thể nằm ở mạng chung, không chỉ trên một máy.

Các bước kiểm tra/xử lý cơ bản
1. Kiểm tra Wi-Fi đã bật và chế độ máy bay đã tắt. Di chuyển đến vị trí có tín hiệu tốt hơn.
2. Xác nhận đang chọn đúng mạng được phép sử dụng. Không kết nối mạng lạ chỉ vì có tên tương tự.
3. Thử ngắt rồi kết nối lại. Nếu cần quên mạng đã lưu, chỉ thực hiện khi đã có thông tin kết nối hợp lệ để đăng nhập lại.
4. Lưu công việc rồi khởi động lại máy. Hỏi người dùng gần đó xem họ có gặp cùng hiện tượng hay không.
5. Không tự khởi động lại thiết bị mạng dùng chung hoặc cài driver từ nguồn không rõ.

Khi nào cần gửi Ticket cho IT
Nếu vẫn lỗi, tạo Ticket ghi thời điểm xảy ra, thông báo lỗi, phạm vi ảnh hưởng và các bước đã thử. Không gửi mật khẩu Wi-Fi hoặc thông tin đăng nhập trong Ticket.`,
  },
  {
    key: 'printer', title: 'Máy in không in được tài liệu',
    content: `Hiện tượng
Lệnh in đã gửi nhưng giấy không ra, tài liệu nằm trong hàng đợi hoặc ứng dụng báo máy in không sẵn sàng.

Nguyên nhân thường gặp
Máy in hết giấy, thiếu mực, đang báo kẹt giấy, kết nối bị gián đoạn hoặc người dùng chọn nhầm máy in. Một tài liệu bị lỗi cũng có thể làm lệnh in bị giữ lại.

Các bước kiểm tra/xử lý cơ bản
1. Kiểm tra nguồn điện, màn hình báo lỗi và khay giấy. Nếu có kẹt giấy, chỉ thao tác theo hướng dẫn của thiết bị, không dùng lực kéo mạnh.
2. Xác nhận đã chọn đúng máy in trong hộp thoại in. Kiểm tra số trang và số bản trước khi gửi lại.
3. Mở hàng đợi in trên máy tính. Chỉ hủy lệnh in của chính mình nếu cần, tránh ảnh hưởng tài liệu của người khác.
4. Kiểm tra cáp kết nối hoặc tình trạng kết nối mạng của máy tính. Thử in một tài liệu ngắn, không chứa thông tin nhạy cảm.
5. Nếu chỉ một ứng dụng gặp lỗi, lưu tài liệu rồi đóng và mở lại ứng dụng. Không tự cài driver không rõ nguồn gốc hoặc thay cấu hình máy in dùng chung.

Khi nào cần gửi Ticket cho IT
Gửi Ticket nếu máy tiếp tục báo lỗi, nhiều người không in được hoặc cần hỗ trợ driver. Nêu tên thiết bị hiển thị, thông báo lỗi và kết quả các bước kiểm tra.`,
  },
  {
    key: 'account-password', title: 'Quên mật khẩu tài khoản nội bộ',
    content: `Hiện tượng
Người dùng không nhớ mật khẩu hoặc hệ thống liên tục thông báo thông tin đăng nhập không hợp lệ.

Nguyên nhân thường gặp
Nhập sai tên tài khoản, bật Caps Lock, chọn nhầm bố cục bàn phím hoặc trình duyệt tự điền mật khẩu cũ. Tài khoản cũng có thể bị khóa sau nhiều lần thử sai.

Các bước kiểm tra/xử lý cơ bản
1. Kiểm tra tên tài khoản và ứng dụng đang truy cập. Xác nhận trang đăng nhập là địa chỉ được cung cấp qua kênh đáng tin cậy.
2. Kiểm tra Caps Lock và ngôn ngữ bàn phím. Tránh thử hàng loạt mật khẩu vì có thể làm tài khoản bị khóa.
3. Nếu hệ thống có chức năng khôi phục mật khẩu được phê duyệt, dùng hướng dẫn trên trang chính thức của hệ thống đó. Không làm theo liên kết đáng ngờ trong tin nhắn.
4. Nếu không có chức năng tự khôi phục, liên hệ bộ phận IT để được xác minh danh tính và hướng dẫn phù hợp.
5. Không gửi mật khẩu cũ, mật khẩu mới hoặc mã xác thực cho người khác. Không dùng tài khoản của đồng nghiệp để thay thế.

Khi nào cần gửi Ticket cho IT
Tạo Ticket khi không thể khôi phục hoặc tài khoản bị khóa. Ghi tên ứng dụng, thời điểm và thông báo lỗi; không đính kèm bí mật đăng nhập. Nội dung này không khẳng định hệ thống đồ án đã có chức năng quên mật khẩu.`,
  },
  {
    key: 'email', title: 'Không gửi hoặc nhận được email',
    content: `Hiện tượng
Thư nằm trong hộp thư đi, gửi bị trả lại hoặc người dùng chưa nhận được thư dự kiến.

Nguyên nhân thường gặp
Mất kết nối mạng, ứng dụng thư chưa đồng bộ, địa chỉ người nhận bị nhập sai, dung lượng hộp thư đầy hoặc tệp đính kèm vượt giới hạn của dịch vụ đang dùng.

Các bước kiểm tra/xử lý cơ bản
1. Kiểm tra kết nối mạng và thử làm mới hộp thư. Nếu có giao diện web được phép sử dụng, kiểm tra thư trên giao diện đó để so sánh.
2. Với thư gửi thất bại, đọc thông báo trả lại và kiểm tra địa chỉ người nhận. Không gửi lặp nhiều lần khi chưa rõ nguyên nhân.
3. Kiểm tra hộp thư đi, thư nháp, thư rác và các bộ lọc đang áp dụng. Thư có thể bị chuyển sang thư mục khác.
4. Xem thông báo dung lượng nếu có. Chỉ dọn các thư không cần thiết sau khi cân nhắc yêu cầu lưu giữ, không xóa hàng loạt dữ liệu công việc.
5. Nếu lỗi liên quan tệp đính kèm, kiểm tra giới hạn của dịch vụ hoặc hỏi IT. Không tải tài liệu nội bộ lên dịch vụ chia sẻ chưa được phép.

Khi nào cần gửi Ticket cho IT
Gửi Ticket khi lỗi kéo dài hoặc ảnh hưởng nhiều người. Ghi thời điểm, ứng dụng đang dùng và mã lỗi; tránh sao chép toàn bộ thư có thông tin nhạy cảm vào Ticket.`,
  },
  {
    key: 'slow-computer', title: 'Máy tính hoạt động chậm',
    content: `Hiện tượng
Máy mất nhiều thời gian mở ứng dụng, thao tác phản hồi chậm hoặc thường xuyên bị đứng trong lúc làm việc.

Nguyên nhân thường gặp
Nhiều chương trình chạy đồng thời, bộ nhớ hoặc ổ lưu trữ gần đầy, ứng dụng đang cập nhật hoặc thiết bị quá nóng. Không thể kết luận máy bị nhiễm mã độc chỉ từ biểu hiện chậm.

Các bước kiểm tra/xử lý cơ bản
1. Lưu công việc đang mở. Đóng các ứng dụng và tab trình duyệt không cần thiết, rồi kiểm tra lại thao tác bị chậm.
2. Mở công cụ theo dõi tài nguyên có sẵn để xem ứng dụng sử dụng nhiều CPU, bộ nhớ hoặc ổ đĩa. Không dừng tiến trình hệ thống khi chưa biết chức năng.
3. Kiểm tra dung lượng trống. Chỉ dọn tệp tạm hoặc tệp cá nhân đã xác nhận không cần, không xóa thư mục hệ thống.
4. Đặt máy ở nơi thông thoáng và tránh che khe tản nhiệt. Khởi động lại sau khi đã lưu công việc nếu máy vẫn phản hồi chậm.
5. Nếu có cảnh báo bảo mật, dùng công cụ đã được cho phép hoặc liên hệ IT. Không tải phần mềm tăng tốc hay tự tắt phần mềm bảo vệ.

Khi nào cần gửi Ticket cho IT
Tạo Ticket nếu tình trạng lặp lại, xuất hiện lỗi ổ đĩa hoặc ảnh hưởng công việc. Mô tả tác vụ, thời điểm và các bước đã thử để IT khoanh vùng.`,
  },
  {
    key: 'network-folder', title: 'Không truy cập được thư mục mạng nội bộ',
    content: `Hiện tượng
Thư mục chia sẻ không mở được, xuất hiện thông báo không tìm thấy đường dẫn hoặc bị từ chối quyền truy cập.

Nguyên nhân thường gặp
Máy chưa kết nối đúng mạng, phiên đăng nhập đã hết hiệu lực, đường dẫn lưu trước đó không còn đúng hoặc tài khoản chưa được cấp quyền cần thiết.

Các bước kiểm tra/xử lý cơ bản
1. Kiểm tra kết nối mạng. Nếu đang làm việc từ xa, chỉ dùng phương thức truy cập từ xa được bộ phận IT hướng dẫn; không tự cài dịch vụ kết nối lạ.
2. Xác nhận đường dẫn thư mục với người phụ trách hoặc IT, không tự đoán địa chỉ máy chủ.
3. Đọc thông báo lỗi để phân biệt lỗi kết nối với lỗi quyền. Thử mở lại sau khi kết nối mạng ổn định.
4. Kiểm tra đang sử dụng đúng tài khoản được cấp. Không mượn thông tin đăng nhập của người khác hoặc lưu mật khẩu trong tài liệu ghi chú.
5. Nếu cần bổ sung quyền, gửi yêu cầu mô tả mục đích công việc và phạm vi thư mục cần dùng. Không tự thay quyền chia sẻ hoặc sao chép dữ liệu sang nơi công cộng để né lỗi.

Khi nào cần gửi Ticket cho IT
Tạo Ticket khi đường dẫn đã xác nhận vẫn không mở được hoặc cần cấp quyền. Ghi thông báo lỗi, thời điểm và việc các thư mục khác có truy cập được hay không.`,
  },
  {
    key: 'microphone', title: 'Microphone không hoạt động khi họp trực tuyến',
    content: `Hiện tượng
Người tham gia cuộc họp không nghe được giọng nói của bạn, âm thanh quá nhỏ hoặc ứng dụng báo không tìm thấy microphone.

Nguyên nhân thường gặp
Microphone đang tắt tiếng, ứng dụng chọn sai thiết bị đầu vào, kết nối tai nghe chưa ổn định hoặc quyền sử dụng microphone chưa được cấp.

Các bước kiểm tra/xử lý cơ bản
1. Kiểm tra nút tắt tiếng trong cuộc họp và trên tai nghe. Xác nhận thiết bị được cắm chắc hoặc đã kết nối không dây đúng cách.
2. Mở phần cài đặt âm thanh của ứng dụng họp và chọn microphone đang dùng. Quan sát mức tín hiệu khi nói hoặc sử dụng chức năng kiểm tra âm thanh.
3. Kiểm tra quyền microphone của ứng dụng hoặc trình duyệt trong cài đặt thiết bị. Nếu quyền bị quản lý và không thể thay đổi, liên hệ IT.
4. Đóng ứng dụng khác có thể đang sử dụng microphone. Lưu công việc rồi mở lại ứng dụng họp nếu cần.
5. Thử thiết bị đầu vào khác nếu có sẵn. Khi kiểm tra âm thanh, tránh để loa phát lớn gây vọng và thông báo cho người cùng họp trước khi thử.

Khi nào cần gửi Ticket cho IT
Gửi Ticket nếu microphone không hoạt động trong nhiều ứng dụng hoặc nghi ngờ thiết bị hỏng. Ghi loại kết nối, ứng dụng, thông báo lỗi và kết quả các bước kiểm tra.`,
  },
  {
    key: 'internal-website', title: 'Không truy cập được website nội bộ',
    content: `Hiện tượng
Trang nội bộ không tải được, tải quá lâu hoặc hiển thị thông báo lỗi kết nối, phiên đăng nhập hay quyền truy cập.

Nguyên nhân thường gặp
Máy chưa ở đúng mạng, địa chỉ trang bị nhập sai, phiên đăng nhập đã hết hạn hoặc dịch vụ tạm thời không sẵn sàng. Lỗi cũng có thể chỉ xảy ra trong một trình duyệt.

Các bước kiểm tra/xử lý cơ bản
1. Xác nhận địa chỉ từ nguồn được cung cấp đáng tin cậy. Không tự đoán tên miền hay dùng liên kết lạ để đăng nhập.
2. Kiểm tra kết nối mạng và thử tải lại trang. Nếu làm việc từ xa, dùng cách kết nối được IT hướng dẫn.
3. Lưu nội dung đang nhập trước khi làm mới hoặc đóng trang. Nếu hệ thống yêu cầu đăng nhập lại, kiểm tra đúng địa chỉ rồi mới thực hiện.
4. Thử trình duyệt khác được phép sử dụng để xác định phạm vi lỗi. Không xóa toàn bộ dữ liệu trình duyệt nếu chưa hiểu ảnh hưởng đến phiên làm việc.
5. Nếu có cảnh báo chứng chỉ hoặc trang giả mạo, dừng đăng nhập và báo IT; không bỏ qua cảnh báo hoặc tắt kiểm tra bảo mật.

Khi nào cần gửi Ticket cho IT
Tạo Ticket khi sự cố kéo dài hoặc nhiều người cùng gặp lỗi. Nêu thời điểm, thông báo lỗi và phạm vi ảnh hưởng; không gửi token phiên hoặc mật khẩu.`,
  },
];

module.exports = articles.map(article => ({
  ...article,
  marker: `[DEMO-KB:${article.key}]`,
  content: `[DEMO-KB:${article.key}]\nDữ liệu demo phục vụ đồ án, không phải quy trình CNTT chính thức.\n\n${article.content}`,
}));
