const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const users = require('../models/userModel');
const { getJwtSecret } = require('../config/jwt');
const { normalizeEmail, isEmail } = require('../utils/validation');

async function login(req, res) {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!isEmail(email) || typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập email hợp lệ và mật khẩu (tối đa 72 byte).' });
  }

  const user = await users.findByEmail(email);
  if (!user || user.status !== 'ACTIVE' || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ success: false, message: 'Email, mật khẩu không đúng hoặc tài khoản đã bị vô hiệu hóa.' });
  }

  const token = jwt.sign({}, getJwtSecret(), {
    algorithm: 'HS256', subject: String(user.id), expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
  return res.json({
    success: true,
    message: 'Đăng nhập thành công',
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status },
  });
}

function me(req, res) {
  res.json({ success: true, user: req.user });
}

module.exports = { login, me };
