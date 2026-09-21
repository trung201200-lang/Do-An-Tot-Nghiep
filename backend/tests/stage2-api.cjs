// Kiểm thử tích hợp trên MySQL local. Chỉ chạy sau khi seed tài khoản demo.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const pool = require('../src/config/db');
const { getJwtSecret } = require('../src/config/jwt');
const results = [];
let base;
let createdId;
let employee;
const temporaryEmail = `stage2-${crypto.randomUUID()}@test.local`;
const demoPassword = process.env.SEED_USER_PASSWORD;
const sessions = {};

async function check(name, run) {
  try { await run(); results.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: 'FAIL', error: error.code || error.name }); throw new Error(`FAIL ${name}`, { cause: error }); }
}
function assertSafe(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert.ok(!/password|hash|secret/i.test(key));
    assertSafe(item);
  }
}
async function request(route, expected, { token, method = 'GET', body } = {}) {
  const response = await fetch(base + route, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.equal(response.status, expected);
  assertSafe(data);
  return data;
}
const login = (email, password = demoPassword, expected = 200) => request('/api/auth/login', expected, { method: 'POST', body: { email, password } });

async function main() {
  assert.notEqual(process.env.NODE_ENV, 'production');
  const [[database]] = await pool.query('SELECT DATABASE() AS name');
  assert.equal(database.name, 'it_support_rag');
  const [original] = await pool.execute('SELECT id, email, password, role, status FROM users WHERE email IN (?, ?, ?) ORDER BY id', ['employee@test.local', 'it@test.local', 'admin@test.local']);
  assert.equal(original.length, 3);
  employee = original.find(user => user.email === 'employee@test.local');
  for (const user of original) assert.equal(user.status, 'ACTIVE');
  await check('Bcrypt: 3 demo passwords hashed, cost 12, compare succeeds', async () => {
    for (const user of original) {
      assert.match(user.password, /^\$2[aby]\$12\$/);
      assert.notEqual(user.password, demoPassword);
      assert.ok(await bcrypt.compare(demoPassword, user.password));
    }
  });
  await check('Seed repeated: no duplicate, unchanged passwords and roles', async () => {
    execFileSync(process.execPath, ['src/utils/seedUsers.js'], { cwd: path.resolve(__dirname, '..'), stdio: 'pipe' });
    const [after] = await pool.execute('SELECT id, email, password, role, status FROM users WHERE email IN (?, ?, ?) ORDER BY id', ['employee@test.local', 'it@test.local', 'admin@test.local']);
    assert.deepEqual(after, original);
  });
  for (const [index, role] of ['EMPLOYEE', 'IT', 'ADMIN'].entries()) {
    await check(`Test ${index + 1}: ${role} login`, async () => {
      sessions[role] = await login(`${role.toLowerCase()}@test.local`);
      assert.equal(sessions[role].user.role, role);
      assert.equal(typeof sessions[role].token, 'string');
    });
  }
  const emp = sessions.EMPLOYEE.token, it = sessions.IT.token, admin = sessions.ADMIN.token;
  await check('Test 4: wrong password', () => login('employee@test.local', crypto.randomUUID(), 401));
  await check('Test 5: unknown email', () => login(temporaryEmail, demoPassword, 401));
  await check('Test 6: missing token', () => request('/api/auth/me', 401));
  await check('Test 7: valid token /me for all roles', async () => {
    for (const role of ['EMPLOYEE', 'IT', 'ADMIN']) {
      const data = await request('/api/auth/me', 200, { token: sessions[role].token });
      assert.equal(data.user.role, role); assert.equal(data.user.status, 'ACTIVE');
    }
  });
  await check('Test 8: EMPLOYEE denied IT', () => request('/api/test/it', 403, { token: emp }));
  await check('Test 9: EMPLOYEE denied ADMIN', () => request('/api/test/admin', 403, { token: emp }));
  await check('Test 10: IT allowed IT', () => request('/api/test/it', 200, { token: it }));
  await check('Test 11: IT denied ADMIN', () => request('/api/test/admin', 403, { token: it }));
  await check('Test 12: ADMIN allowed ADMIN', () => request('/api/test/admin', 200, { token: admin }));
  await check('Test 13: ADMIN lists users', async () => {
    const data = await request('/api/users', 200, { token: admin }); assert.ok(data.users.length >= 3);
  });
  await check('Test 14: EMPLOYEE denied users', () => request('/api/users', 403, { token: emp }));
  await check('Test 15: INACTIVE login and existing token rejected; restored ACTIVE', async () => {
    try {
      await request(`/api/users/${employee.id}/status`, 200, { token: admin, method: 'PATCH', body: { status: 'INACTIVE' } });
      await login(employee.email, demoPassword, 401);
      await request('/api/auth/me', 401, { token: emp });
    } finally {
      await request(`/api/users/${employee.id}/status`, 200, { token: admin, method: 'PATCH', body: { status: employee.status } });
    }
    await login(employee.email);
  });
  await check('RBAC full matrix and non-admin mutations denied', async () => {
    for (const token of [emp, it, admin]) await request('/api/test/employee', 200, { token });
    await request('/api/test/it', 200, { token: admin });
    await request('/api/users', 403, { token: it });
    for (const token of [emp, it]) {
      await request('/api/users', 403, { token, method: 'POST', body: {} });
      await request(`/api/users/${employee.id}/role`, 403, { token, method: 'PATCH', body: { role: 'ADMIN' } });
      await request(`/api/users/${employee.id}/status`, 403, { token, method: 'PATCH', body: { status: 'INACTIVE' } });
    }
  });
  await check('ADMIN creates user: bcrypt hash, defaults, duplicate email rejected', async () => {
    const data = await request('/api/users', 201, { token: admin, method: 'POST', body: { name: 'Temporary API test', email: temporaryEmail, password: demoPassword } });
    createdId = data.user.id;
    assert.equal(data.user.role, 'EMPLOYEE'); assert.equal(data.user.status, 'ACTIVE');
    const [[stored]] = await pool.execute('SELECT password FROM users WHERE id = ?', [createdId]);
    assert.match(stored.password, /^\$2[aby]\$12\$/); assert.ok(await bcrypt.compare(demoPassword, stored.password));
    await request('/api/users', 409, { token: admin, method: 'POST', body: { name: 'Duplicate', email: temporaryEmail.toUpperCase(), password: demoPassword } });
  });
  await check('ADMIN changes role; existing JWT uses current DB role', async () => {
    const session = await login(temporaryEmail);
    await request('/api/test/it', 403, { token: session.token });
    await request(`/api/users/${createdId}/role`, 200, { token: admin, method: 'PATCH', body: { role: 'IT' } });
    await request('/api/test/it', 200, { token: session.token });
    await request(`/api/users/${createdId}/role`, 200, { token: admin, method: 'PATCH', body: { role: 'EMPLOYEE' } });
    await request('/api/test/it', 403, { token: session.token });
  });
  await check('Invalid role/status/id/email/password rejected', async () => {
    const body = { name: 'Validation test', email: temporaryEmail, password: demoPassword };
    for (const patch of [{ role: 'OWNER' }, { status: 'DISABLED' }, { email: 'invalid' }, { password: 'short' }, { password: 'a'.repeat(73) }, { name: '' }]) {
      await request('/api/users', 400, { token: admin, method: 'POST', body: { ...body, ...patch } });
    }
    await request(`/api/users/${createdId}/role`, 400, { token: admin, method: 'PATCH', body: { role: 'OWNER' } });
    await request(`/api/users/${createdId}/status`, 400, { token: admin, method: 'PATCH', body: { status: 'DISABLED' } });
    await request('/api/users/invalid/role', 400, { token: admin, method: 'PATCH', body: { role: 'IT' } });
  });
  await check('Invalid, expired, wrong-signature JWT rejected', async () => {
    for (const token of ['invalid', jwt.sign({}, getJwtSecret(), { subject: String(employee.id), expiresIn: -1 }), jwt.sign({}, crypto.randomBytes(48), { subject: String(employee.id), expiresIn: 60 })]) {
      await request('/api/auth/me', 401, { token });
    }
  });
  await check('Health and real MySQL health available', async () => {
    await request('/api/health', 200); await request('/api/health/db', 200);
  });
}

const server = app.listen(0, '127.0.0.1', async () => {
  base = `http://127.0.0.1:${server.address().port}`;
  try { await main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
  finally {
    try {
      if (employee) await pool.execute('UPDATE users SET role = ?, status = ? WHERE id = ? AND email = ?', [employee.role, employee.status, employee.id, employee.email]);
      // Chỉ xóa bản ghi tạm do chính lần kiểm thử này tạo; không xóa dữ liệu có sẵn.
      if (createdId) await pool.execute('DELETE FROM users WHERE id = ? AND email = ?', [createdId, temporaryEmail]);
      const [accounts] = await pool.query('SELECT email, role, status FROM users ORDER BY id');
      console.log('FINAL_ACCOUNTS', JSON.stringify(accounts));
      fs.writeFileSync(path.resolve(__dirname, '../../docs/stage2-api-results.json'), JSON.stringify({ testedAt: new Date().toISOString(), results, accounts }, null, 2) + '\n');
    } catch (error) { console.error('Cleanup/report failed', error.code || error.name); process.exitCode = 1; }
    server.close(); await pool.end();
  }
});
