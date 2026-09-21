const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/jwt');
const users = require('../models/userModel');
const { parseId } = require('../utils/validation');

async function authenticate(req, res, next) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get('Authorization') || '');
  if (!match) {
    return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập bằng Bearer token hợp lệ.' });
  }

  const secret = getJwtSecret();
  let payload;
  try {
    payload = jwt.verify(match[1], secret, { algorithms: ['HS256'] });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.name === 'TokenExpiredError' ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' : 'Token không hợp lệ.',
    });
  }

  if (typeof payload !== 'object' || typeof payload.sub !== 'string' || !parseId(payload.sub) || !Number.isFinite(payload.exp)) {
    return res.status(401).json({ success: false, message: 'Token không hợp lệ.' });
  }
  // Đọc lại role và status từ database để thay đổi quyền có hiệu lực ngay.
  const user = await users.findById(Number(payload.sub));
  if (!user || user.status !== 'ACTIVE') {
    return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa.' });
  }
  req.user = user;
  next();
}

module.exports = authenticate;
