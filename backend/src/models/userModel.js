const pool = require('../config/db');

async function findByEmail(email) {
  const [rows] = await pool.execute(
    'SELECT id, name, email, password, role, status FROM users WHERE email = ? LIMIT 1', [email],
  );
  return rows[0];
}

async function findById(id) {
  const [rows] = await pool.execute(
    'SELECT id, name, email, role, status FROM users WHERE id = ? LIMIT 1', [id],
  );
  return rows[0];
}

async function listUsers() {
  const [rows] = await pool.execute(
    'SELECT id, name, email, role, status, created_at, updated_at FROM users ORDER BY id DESC',
  );
  return rows;
}

async function createUser({ name, email, password, role, status }) {
  const [result] = await pool.execute(
    'INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)',
    [name, email, password, role, status],
  );
  return findById(result.insertId);
}

// Mọi cập nhật role/status dùng cùng thứ tự khóa để tránh hai request cùng
// loại bỏ ADMIN ACTIVE cuối. Quy mô users nhỏ; không thêm bảng/khóa phân tán.
async function updateAccess(id, field, value) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT id, name, email, role, status FROM users ORDER BY id FOR UPDATE',
    );
    const target = rows.find(user => user.id === id);
    if (!target) { await connection.commit(); return undefined; }
    const next = { ...target, [field]: value };
    if (target.role === 'ADMIN' && target.status === 'ACTIVE'
        && (next.role !== 'ADMIN' || next.status !== 'ACTIVE')
        && !rows.some(user => user.id !== id && user.role === 'ADMIN' && user.status === 'ACTIVE')) {
      throw Object.assign(new Error('Không thể hạ quyền hoặc vô hiệu hóa ADMIN đang hoạt động cuối cùng.'), {
        code: 'LAST_ACTIVE_ADMIN', status: 409, isUserError: true,
      });
    }
    // field chỉ do hai hàm nội bộ bên dưới lựa chọn, không nhận từ request.
    await connection.execute(`UPDATE users SET ${field} = ? WHERE id = ?`, [value, id]);
    await connection.commit();
    return next;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateStatus(id, status) { return updateAccess(id, 'status', status); }
async function updateRole(id, role) { return updateAccess(id, 'role', role); }

module.exports = { findByEmail, findById, listUsers, createUser, updateStatus, updateRole };
