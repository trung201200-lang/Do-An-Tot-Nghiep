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

async function updateStatus(id, status) {
  await pool.execute('UPDATE users SET status = ? WHERE id = ?', [status, id]);
  return findById(id);
}

async function updateRole(id, role) {
  await pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, id]);
  return findById(id);
}

module.exports = { findByEmail, findById, listUsers, createUser, updateStatus, updateRole };
