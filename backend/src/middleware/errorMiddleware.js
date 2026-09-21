function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.isTicketError || error.isKnowledgeError) return res.status(error.status).json({ success: false, message: error.message });
  if (error.code === 'ER_DUP_ENTRY') {
    if (req.originalUrl.startsWith('/api/knowledge')) return res.status(409).json({ success: false, message: 'Mã bài viết bị trùng. Hãy thử lại.' });
    return res.status(409).json({ success: false, message: req.baseUrl.startsWith('/api/tickets') || req.originalUrl.startsWith('/api/tickets') ? 'Mã Ticket bị trùng. Hãy thử lại.' : 'Email đã tồn tại.' });
  }
  if (error.code === 'ER_NO_SUCH_TABLE') {
    return res.status(503).json({ success: false, message: 'Thiếu bảng dữ liệu. Hãy kiểm tra file SQL của giai đoạn tương ứng trong thư mục database bằng MySQL Workbench.' });
  }
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR'].includes(error.code)) {
    return res.status(503).json({ success: false, message: 'Không thể truy cập database. Hãy kiểm tra MySQL và cấu hình local.' });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Dữ liệu JSON không hợp lệ.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Dữ liệu gửi lên quá lớn.' });
  }
  // Không ghi lỗi gốc ra log/response vì có thể chứa password hoặc câu SQL.
  res.status(500).json({ success: false, message: 'Không thể xử lý yêu cầu. Hãy kiểm tra cấu hình backend hoặc thử lại sau.' });
}

module.exports = errorHandler;
