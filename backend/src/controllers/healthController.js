const pool = require('../config/db');

function checkHealth(req, res) {
  res.json({ success: true, message: 'IT Support System API is running' });
}

async function checkDatabase(req, res) {
  const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  if (required.some((key) => !process.env[key])) {
    return res.status(503).json({
      success: false,
      message: 'Chưa đủ cấu hình MySQL. Hãy nhập thông tin vào backend/.env rồi khởi động lại backend.',
    });
  }

  try {
    await pool.query('SELECT 1');
    return res.json({ success: true, message: 'MySQL connected successfully' });
  } catch (error) {
    const messages = {
      ER_ACCESS_DENIED_ERROR: 'Thông tin đăng nhập MySQL không đúng. Kiểm tra backend/.env.',
      ER_BAD_DB_ERROR: 'Database chưa tồn tại. Hãy chạy database/01_create_database.sql trong MySQL Workbench.',
      ECONNREFUSED: 'Không kết nối được MySQL Server. Kiểm tra dịch vụ MySQL, DB_HOST và DB_PORT.',
      ETIMEDOUT: 'Kết nối MySQL quá thời gian chờ. Kiểm tra MySQL Server.',
    };
    // Không trả lỗi gốc vì có thể chứa thông tin kết nối nhạy cảm.
    return res.status(503).json({
      success: false,
      message: messages[error.code] || 'Không thể kết nối MySQL. Kiểm tra MySQL Server và cấu hình backend/.env.',
    });
  }
}

module.exports = { checkHealth, checkDatabase };
