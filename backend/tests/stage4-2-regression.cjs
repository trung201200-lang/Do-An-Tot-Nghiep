// Chạy nguyên bộ test cũ; dọn riêng Ticket demo mới do suite GĐ3 tạo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const pool = require('../src/config/db');
const root = path.resolve(__dirname, '../..');
const suites = [
  { script: 'stage2-api.cjs', report: 'stage2-api-results.json' },
  { script: 'stage3-api.cjs', report: 'stage3-api-results.json' },
];
const result = { testedAt: new Date().toISOString(), suites: [], dataPreserved: false };
const backups = new Map();
let originalUsers, originalTickets, originalHistory, originalArticles;
async function main() {
  assert.notEqual(process.env.NODE_ENV, 'production');
  const [[db]] = await pool.query('SELECT DATABASE() AS name'); assert.equal(db.name, 'it_support_rag');
  [originalUsers] = await pool.query('SELECT * FROM users ORDER BY id');
  [originalTickets] = await pool.query('SELECT * FROM tickets ORDER BY id');
  [originalHistory] = await pool.query('SELECT * FROM ticket_history ORDER BY id');
  [originalArticles] = await pool.query('SELECT * FROM knowledge_articles ORDER BY id');
  for (const suite of suites) {
    const reportPath = path.join(root, 'docs', suite.report);
    backups.set(reportPath, fs.readFileSync(reportPath));
    execFileSync(process.execPath, [path.join(__dirname, suite.script)], { cwd: path.join(root, 'backend'), stdio: 'inherit', timeout: 120000 });
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.ok(report.results.every(test => test.status === 'PASS'));
    result.suites.push({ script: suite.script, results: report.results });
    if (suite.script === 'stage3-api.cjs') {
      const oldIds = new Set(originalTickets.map(ticket => ticket.id));
      const newDemo = report.remainingTickets.filter(ticket => !oldIds.has(ticket.id));
      const employee = originalUsers.find(user => user.email === 'employee@test.local');
      const it = originalUsers.find(user => user.email === 'it@test.local');
      assert.equal(newDemo.length, 2);
      for (const ticket of newDemo) {
        assert.ok(['Demo: Máy tính không kết nối Wi-Fi', 'Demo: Máy in cần kiểm tra thêm'].includes(ticket.title));
        assert.equal(ticket.created_by, employee.id); assert.equal(ticket.assigned_to, it.id);
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          await connection.execute('DELETE FROM ticket_history WHERE ticket_id = ?', [ticket.id]);
          await connection.execute('DELETE FROM tickets WHERE id = ? AND title = ? AND created_by = ?', [ticket.id, ticket.title, employee.id]);
          await connection.commit();
        } catch (error) { await connection.rollback(); throw error; }
        finally { connection.release(); }
      }
    }
  }
  const [afterUsers] = await pool.query('SELECT * FROM users ORDER BY id');
  assert.equal(afterUsers.length, originalUsers.length);
  for (let index = 0; index < originalUsers.length; index++) {
    const before = originalUsers[index], after = afterUsers[index];
    // Bộ test cũ tạm đổi status; chỉ khôi phục timestamp sau khi xác nhận mọi trường khác nguyên vẹn.
    assert.deepEqual({ ...after, updated_at: before.updated_at }, before);
    if (+after.updated_at !== +before.updated_at) await pool.execute('UPDATE users SET updated_at = ? WHERE id = ?', [before.updated_at, before.id]);
  }
  const [tickets] = await pool.query('SELECT * FROM tickets ORDER BY id');
  const [history] = await pool.query('SELECT * FROM ticket_history ORDER BY id');
  const [articles] = await pool.query('SELECT * FROM knowledge_articles ORDER BY id');
  const [users] = await pool.query('SELECT * FROM users ORDER BY id');
  assert.deepEqual(users, originalUsers); assert.deepEqual(tickets, originalTickets);
  assert.deepEqual(history, originalHistory); assert.deepEqual(articles, originalArticles);
  result.dataPreserved = true;
  result.counts = { users: users.length, tickets: tickets.length, ticket_history: history.length, knowledge_articles: articles.length };
  console.log('PASS: regression và dữ liệu cũ được giữ nguyên.');
}
main().catch(error => { console.error('Regression failed:', error.code || error.name); process.exitCode = 1; })
  .finally(async () => {
    for (const [file, content] of backups) fs.writeFileSync(file, content);
    fs.writeFileSync(path.join(root, 'docs/stage4-2-regression-results.json'), JSON.stringify(result, null, 2) + '\n');
    await pool.end();
  });
