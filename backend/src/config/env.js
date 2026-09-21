const path = require('node:path');
const dotenv = require('dotenv');

// Luôn đọc backend/.env dù chạy lệnh từ thư mục nào.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
