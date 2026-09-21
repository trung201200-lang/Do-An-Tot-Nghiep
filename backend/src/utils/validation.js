const ROLES = ['EMPLOYEE', 'IT', 'ADMIN'];
const STATUSES = ['ACTIVE', 'INACTIVE'];

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPassword(value) {
  // bcrypt chỉ sử dụng tối đa 72 byte đầu vào.
  return typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 72;
}

function parseId(value) {
  return /^[1-9]\d*$/.test(value) && Number(value) <= 2147483647 ? Number(value) : null;
}

module.exports = { ROLES, STATUSES, normalizeEmail, isEmail, isPassword, parseId };
