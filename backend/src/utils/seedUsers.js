require('../config/env');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const users = require('../models/userModel');
const { isPassword } = require('./validation');

async function seedUsers() {
  if (process.env.NODE_ENV === 'production') throw new Error('Chỉ được seed tài khoản thử nghiệm trong local/demo.');
  const password = process.env.SEED_USER_PASSWORD;
  if (!isPassword(password)) throw new Error('Hãy nhập SEED_USER_PASSWORD trong backend/.env: ít nhất 8 ký tự, tối đa 72 byte.');

  const accounts = [
    { name: 'Nhân viên thử nghiệm', email: 'employee@test.local', role: 'EMPLOYEE' },
    { name: 'Nhân viên IT thử nghiệm', email: 'it@test.local', role: 'IT' },
    { name: 'Quản trị viên thử nghiệm', email: 'admin@test.local', role: 'ADMIN' },
  ];
  for (const account of accounts) {
    if (await users.findByEmail(account.email)) {
      console.log(`Bỏ qua tài khoản đã tồn tại: ${account.email}; giữ nguyên mật khẩu, quyền và trạng thái.`);
      continue;
    }
    const hash = await bcrypt.hash(password, 12);
    try {
      await users.createUser({ ...account, password: hash, status: 'ACTIVE' });
      console.log(`Đã tạo: ${account.email} (${account.role})`);
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
      console.log(`Bỏ qua tài khoản vừa được tạo bởi tiến trình khác: ${account.email}`);
    }
  }
}

seedUsers().catch((error) => {
  if (error.code === 'ER_NO_SUCH_TABLE') {
    console.error('Hãy chạy database/02_create_users.sql trong MySQL Workbench rồi chạy lại seed.');
  } else if (!error.code) {
    console.error(error.message);
  } else {
    console.error('Seed thất bại. Kiểm tra MySQL và cấu hình local. Không có dữ liệu cũ bị xóa.');
  }
  process.exitCode = 1;
}).finally(() => pool.end());
