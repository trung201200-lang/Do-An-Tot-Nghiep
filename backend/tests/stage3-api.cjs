const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const app = require('../src/app');
const pool = require('../src/config/db');
const results = [];
const ticketIds = [], temporaryUsers = [], keep = new Set();
let base, employee, it, admin, otherEmployee, otherIt, primary, reopened, foreign;
let failed = false;
function safe(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) { assert.ok(!/password|hash|secret/i.test(key)); safe(item); }
}
async function request(route, status, token, method = 'GET', body) {
  const response = await fetch(base + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  assert.equal(response.status, status, `${method} ${route}: ${data.message || response.status}`);
  safe(data); return data;
}
async function test(number, name, action) {
  try { await action(); results.push({ test: number, name, status: 'PASS' }); console.log(`PASS ${number}: ${name}`); }
  catch (error) { failed = true; results.push({ test: number, name, status: 'FAIL', message: error.message }); throw error; }
}
const login = email => request('/api/auth/login', 200, null, 'POST', { email, password: process.env.SEED_USER_PASSWORD });
async function create(session, title) {
  const { ticket } = await request('/api/tickets', 201, session.token, 'POST', { title, description: 'Mô tả kiểm thử hỗ trợ CNTT.' });
  ticketIds.push(ticket.id); return ticket;
}
const get = async (ticket, session = employee) => (await request(`/api/tickets/${ticket.id}`, 200, session.token)).ticket;
const patch = (ticket, action, body, status = 200, session = it) => request(`/api/tickets/${ticket.id}/${action}`, status, session.token, 'PATCH', body);
async function main() {
  assert.notEqual(process.env.NODE_ENV, 'production');
  const [[db]] = await pool.query('SELECT DATABASE() AS name'); assert.equal(db.name, 'it_support_rag');
  employee = await login('employee@test.local'); it = await login('it@test.local'); admin = await login('admin@test.local');
  for (const role of ['EMPLOYEE', 'IT']) {
    const email = `stage3-${randomUUID()}@test.local`;
    const { user } = await request('/api/users', 201, admin.token, 'POST', { name: 'Tài khoản kiểm thử tạm', email, role, password: process.env.SEED_USER_PASSWORD });
    temporaryUsers.push({ id: user.id, email });
    const session = await login(email);
    if (role === 'EMPLOYEE') otherEmployee = session; else otherIt = session;
  }
  await test(1, 'EMPLOYEE tạo Ticket NEW', async () => { primary = await create(employee, 'Demo: Máy tính không kết nối Wi-Fi'); assert.equal(primary.status, 'NEW'); assert.equal(primary.created_by, employee.user.id); assert.equal(primary.assigned_to, null); assert.equal(primary.solution, null); assert.match(primary.code, /^TKT-\d{6,}$/); });
  await test(2, 'Priority mặc định LOW', async () => assert.equal(primary.priority, 'LOW'));
  foreign = await create(otherEmployee, 'Ticket riêng của Employee khác');
  await test(3, 'EMPLOYEE chỉ thấy Ticket của mình', async () => { const data = await request('/api/tickets', 200, employee.token); assert.ok(data.tickets.some(t => t.id === primary.id)); assert.ok(data.tickets.every(t => t.created_by === employee.user.id)); assert.ok(!data.tickets.some(t => t.id === foreign.id)); });
  await test(4, 'EMPLOYEE không xem Ticket người khác', () => request(`/api/tickets/${foreign.id}`, 403, employee.token));
  await test(5, 'EMPLOYEE không được tiếp nhận', () => patch(primary, 'accept', {}, 403, employee));
  await test(6, 'IT xem tất cả Ticket', async () => { const { tickets } = await request('/api/tickets', 200, it.token); assert.ok(tickets.some(t => t.id === primary.id)); assert.ok(tickets.some(t => t.id === foreign.id)); });
  await test(7, 'IT tiếp nhận NEW -> RECEIVED', async () => { const data = await patch(primary, 'accept', {}); assert.equal(data.ticket.status, 'RECEIVED'); });
  await test(8, 'assigned_to lấy từ IT đăng nhập', async () => assert.equal((await get(primary)).assigned_to, it.user.id));
  await test(9, 'Priority LOW -> HIGH', async () => { const { ticket } = await patch(primary, 'priority', { priority: 'HIGH' }); assert.equal(ticket.priority, 'HIGH'); });
  await test(10, 'RECEIVED -> IN_PROGRESS', async () => assert.equal((await patch(primary, 'status', { status: 'IN_PROGRESS' })).ticket.status, 'IN_PROGRESS'));
  await test(11, 'Không cho NEW -> RESOLVED', () => patch(foreign, 'status', { status: 'RESOLVED', solution: 'Không được nhảy bước' }, 409));
  await test(12, 'RESOLVED thiếu solution bị từ chối', async () => { await patch(primary, 'status', { status: 'RESOLVED' }, 400); await patch(primary, 'status', { status: 'RESOLVED', solution: '   ' }, 400); assert.equal((await get(primary)).status, 'IN_PROGRESS'); });
  await test(13, 'RESOLVED có solution thành công', async () => { const data = await patch(primary, 'status', { status: 'RESOLVED', solution: 'Đã cấu hình lại Wi-Fi và kiểm tra kết nối.' }); assert.equal(data.ticket.status, 'RESOLVED'); assert.ok(data.ticket.solution); });
  await test(14, 'RESOLVED -> CLOSED', async () => assert.equal((await patch(primary, 'status', { status: 'CLOSED' })).ticket.status, 'CLOSED'));
  await test(15, 'CLOSED không mở lại', () => patch(primary, 'status', { status: 'IN_PROGRESS' }, 409));
  reopened = await create(employee, 'Demo: Máy in cần kiểm tra thêm');
  await patch(reopened, 'accept', {}); await patch(reopened, 'status', { status: 'IN_PROGRESS' }); await patch(reopened, 'status', { status: 'RESOLVED', solution: 'Đã kiểm tra kết nối máy in.' });
  await test(16, 'RESOLVED -> IN_PROGRESS', async () => assert.equal((await patch(reopened, 'status', { status: 'IN_PROGRESS' })).ticket.status, 'IN_PROGRESS'));
  await test(17, 'Mọi thay đổi trạng thái có history đúng thứ tự', async () => {
    const t = await get(primary);
    assert.deepEqual(t.history.map(h => [h.old_status, h.new_status]), [[null, 'NEW'], ['NEW', 'RECEIVED'], ['RECEIVED', 'IN_PROGRESS'], ['IN_PROGRESS', 'RESOLVED'], ['RESOLVED', 'CLOSED']]);
    assert.equal(t.history[0].actor_id, employee.user.id); assert.ok(t.history.slice(1).every(h => h.actor_id === it.user.id));
    const r = await get(reopened); assert.equal(r.history.length, 5); assert.equal(r.history[4].old_status, 'RESOLVED'); assert.equal(r.history[4].new_status, 'IN_PROGRESS');
  });
  await test(18, 'EMPLOYEE xem history của mình', async () => { const t = await get(primary); assert.equal(t.history.length, 5); assert.ok(t.history.every(h => h.actor_name)); });
  await test(19, 'IT khác không xử lý Ticket đã assigned', async () => { await patch(reopened, 'status', { status: 'RESOLVED', solution: 'Giả mạo xử lý' }, 403, otherIt); await patch(reopened, 'priority', { priority: 'HIGH' }, 403, otherIt); });
  await test(20, 'API không trả password/hash user', async () => { for (const session of [employee, it, admin]) { safe(await request('/api/tickets', 200, session.token)); safe(await get(primary, session)); } });
  await test(21, 'Không token -> 401', async () => { await request('/api/tickets', 401); await request(`/api/tickets/${primary.id}`, 401); await request('/api/tickets', 401, null, 'POST', {}); for (const action of ['accept', 'status', 'priority']) await request(`/api/tickets/${primary.id}/${action}`, 401, null, 'PATCH', {}); });
  await test(22, 'Role không phù hợp -> 403', async () => { for (const session of [it, admin]) await request('/api/tickets', 403, session.token, 'POST', { title: 'Không đúng role', description: 'Test' }); await patch(reopened, 'priority', { priority: 'HIGH' }, 403, employee); await patch(reopened, 'status', { status: 'CLOSED' }, 403, employee); });
  await test(23, 'ID không tồn tại -> 404, ID sai -> 400', async () => { await request('/api/tickets/2147483647', 404, it.token); await request('/api/tickets/abc', 400, it.token); await request('/api/tickets/2147483647/accept', 404, it.token, 'PATCH', {}); });
  await test(24, 'Priority không hợp lệ bị từ chối', () => patch(reopened, 'priority', { priority: 'URGENT' }, 400));
  await test(25, 'Title/description rỗng bị từ chối', async () => { for (const body of [{ title: '', description: 'Test' }, { title: 'Test', description: '  ' }, { title: 123, description: 'Test' }]) await request('/api/tickets', 400, employee.token, 'POST', body); });
  await test('B1', 'Chặn giả mạo trường server quản lý', async () => {
    for (const key of ['created_by', 'assigned_to', 'status', 'solution', 'priority']) await request('/api/tickets', 400, employee.token, 'POST', { title: 'Test', description: 'Test', [key]: 'fake' });
    await patch(foreign, 'accept', { assigned_to: admin.user.id }, 400);
  });
  await test('B2', 'ADMIN xử lý Ticket của IT, CLOSED chỉ xem', async () => {
    await patch(reopened, 'priority', { priority: 'MEDIUM' }, 200, admin);
    await patch(reopened, 'status', { status: 'RESOLVED', solution: 'Quản trị viên đã kiểm tra bổ sung.' }, 200, admin);
    await patch(reopened, 'status', { status: 'IN_PROGRESS' }, 200, admin);
    await patch(primary, 'priority', { priority: 'LOW' }, 409, admin);
  });
  await test('B3', 'Hai người nhận đồng thời: chỉ một thành công', async () => {
    const racing = await create(employee, 'Kiểm thử nhận đồng thời');
    const send = session => fetch(`${base}/api/tickets/${racing.id}/accept`, { method: 'PATCH', headers: { Authorization: `Bearer ${session.token}` } });
    const responses = await Promise.all([send(it), send(admin)]);
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
    const final = await get(racing); assert.equal(final.history.length, 2); assert.ok([it.user.id, admin.user.id].includes(final.assigned_to));
  });
  await test('B4', 'Rollback thật khi bước ghi history thất bại', async () => {
    const before = await get(reopened);
    const [[countBefore]] = await pool.query('SELECT COUNT(*) AS n FROM tickets');
    const originalGet = pool.getConnection;
    pool.getConnection = async function () {
      const connection = await originalGet.call(pool);
      const execute = connection.execute, release = connection.release;
      connection.execute = function (sql, params) {
        if (sql.startsWith('INSERT INTO ticket_history')) throw new Error('Lỗi ghi lịch sử được chủ động mô phỏng trong kiểm thử');
        return execute.call(connection, sql, params);
      };
      connection.release = function () { connection.execute = execute; connection.release = release; return release.call(connection); };
      return connection;
    };
    try {
      await patch(reopened, 'status', { status: 'RESOLVED', solution: 'Phải rollback' }, 500);
      await request('/api/tickets', 500, employee.token, 'POST', { title: 'Phải rollback tạo mới', description: 'Test rollback' });
    } finally { pool.getConnection = originalGet; }
    assert.deepEqual(await get(reopened), before);
    const [[countAfter]] = await pool.query('SELECT COUNT(*) AS n FROM tickets'); assert.equal(countAfter.n, countBefore.n);
  });
  await test('B5', 'Workflow khác bị chặn và không thêm history', async () => {
    const t = await create(employee, 'Kiểm thử workflow sai');
    await patch(t, 'status', { status: 'CLOSED' }, 409);
    await patch(t, 'accept', {});
    await patch(t, 'accept', {}, 409);
    await patch(t, 'status', { status: 'CLOSED' }, 409);
    await patch(t, 'status', { status: 'UNKNOWN' }, 400);
    assert.equal((await get(t)).history.length, 2);
  });
  keep.add(primary.id); keep.add(reopened.id);
}
const server = app.listen(0, '127.0.0.1', async () => {
  base = `http://127.0.0.1:${server.address().port}`;
  try { await main(); } catch (error) { failed = true; console.error(error.message); process.exitCode = 1; }
  finally {
    try {
      // Chỉ dọn các bản ghi do chính lần kiểm thử tạo ra, theo đúng ID.
      for (const id of ticketIds) {
        if (!failed && keep.has(id)) continue;
        await pool.execute('DELETE FROM ticket_history WHERE ticket_id = ?', [id]);
        await pool.execute('DELETE FROM tickets WHERE id = ?', [id]);
      }
      for (const user of temporaryUsers) await pool.execute('DELETE FROM users WHERE id = ? AND email = ?', [user.id, user.email]);
      const [remaining] = await pool.query('SELECT id, code, title, status, priority, created_by, assigned_to FROM tickets ORDER BY id');
      const [[history]] = await pool.query('SELECT COUNT(*) AS count FROM ticket_history');
      fs.writeFileSync(path.resolve(__dirname, '../../docs/stage3-api-results.json'), JSON.stringify({ testedAt: new Date().toISOString(), results, remainingTickets: remaining, historyCount: history.count }, null, 2) + '\n');
      console.log('Remaining tickets:', remaining.length, 'History:', history.count);
    } catch (error) { console.error('Cleanup/report failed', error.code || error.name); process.exitCode = 1; }
    server.close(); await pool.end();
  }
});
