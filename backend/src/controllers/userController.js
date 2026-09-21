const bcrypt = require('bcrypt');
const users = require('../models/userModel');
const { ROLES, STATUSES, normalizeEmail, isEmail, isPassword, parseId } = require('../utils/validation');

async function list(req, res) {
  res.json({ success: true, users: await users.listUsers() });
}

async function create(req, res) {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = normalizeEmail(body.email);
  const role = body.role ?? 'EMPLOYEE';
  const status = body.status ?? 'ACTIVE';
  if (!name || name.length > 100 || !isEmail(email) || !isPassword(body.password)) {
    return res.status(400).json({ success: false, message: 'Tên tối đa 100 ký tự, email hợp lệ, mật khẩu ít nhất 8 ký tự và tối đa 72 byte.' });
  }
  if (!ROLES.includes(role) || !STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: 'Vai trò hoặc trạng thái không hợp lệ.' });
  }
  if (await users.findByEmail(email)) {
    return res.status(409).json({ success: false, message: 'Email đã tồn tại.' });
  }
  const password = await bcrypt.hash(body.password, 12);
  const user = await users.createUser({ name, email, password, role, status });
  res.status(201).json({ success: true, message: 'Đã tạo tài khoản.', user });
}

async function changeStatus(req, res) {
  const id = parseId(req.params.id);
  const status = req.body?.status;
  if (!id || !STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: 'ID hoặc trạng thái không hợp lệ.' });
  }
  const user = await users.updateStatus(id, status);
  if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
  res.json({ success: true, message: 'Đã cập nhật trạng thái.', user });
}

async function changeRole(req, res) {
  const id = parseId(req.params.id);
  const role = req.body?.role;
  if (!id || !ROLES.includes(role)) {
    return res.status(400).json({ success: false, message: 'ID hoặc vai trò không hợp lệ.' });
  }
  const user = await users.updateRole(id, role);
  if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
  res.json({ success: true, message: 'Đã cập nhật vai trò.', user });
}

module.exports = { list, create, changeStatus, changeRole };
