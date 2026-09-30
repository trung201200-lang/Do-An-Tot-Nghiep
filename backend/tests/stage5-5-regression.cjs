const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const pool = require('../src/config/db');
const { snapshot, counts } = require('../src/rag/retrievalExperiment');
const { ensureNoSecrets } = require('../src/rag/generationSafety');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'docs/stage5-5-results.json');
const report = { testedAt: new Date().toISOString(), completed: false, regression: [], checks: [] };
const backups = new Map();
let before;
const read = file => fs.readFileSync(path.join(root, file));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 4e6 }).trim();
function run(script, timeout = 180000) {
  // Không in raw stdout/stderr hoặc Error của tiến trình con có thể chứa token khi assertion lỗi.
  try { execFileSync(process.execPath, [path.join(__dirname, script)], { cwd: path.join(root, 'backend'), stdio: 'pipe', timeout, windowsHide: true, maxBuffer: 6e6 }); }
  catch { throw new Error('REGRESSION_FAILED: ' + script); }
}
async function cleanupTicket(browserReport) {
  const created = browserReport.demoTicket;
  if (!created || before.tickets.some(row => row.id === created.id)) return;
  const [[ticket]] = await pool.execute('SELECT id,code,title,created_by FROM tickets WHERE id = ?', [created.id]);
  assert.ok(ticket); assert.equal(ticket.code, created.code); assert.equal(ticket.title, 'Demo giao diện: Không kết nối được Wi-Fi văn phòng');
  assert.equal(ticket.created_by, before.users.find(user => user.email === 'employee@test.local').id);
  const connection = await pool.getConnection();
  try { await connection.beginTransaction(); await connection.execute('DELETE FROM ticket_history WHERE ticket_id = ?', [ticket.id]); await connection.execute('DELETE FROM tickets WHERE id = ? AND code = ? AND title = ?', [ticket.id, ticket.code, ticket.title]); await connection.commit(); }
  catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
async function main() {
  assert.notEqual(process.env.NODE_ENV, 'production'); assert.ok(['127.0.0.1', 'localhost', '::1'].includes(process.env.DB_HOST));
  before = await snapshot(pool); report.databaseBefore = counts(before); assert.deepEqual(report.databaseBefore, { users: 3, tickets: 3, ticket_history: 17, knowledge_articles: 8 });
  // Lưu nguyên byte để không cập nhật số liệu/báo cáo các giai đoạn trước.
  for (const name of fs.readdirSync(path.join(root, 'docs'))) if (/\.(json|png)$/.test(name) && name !== 'stage5-5-results.json') backups.set(name, read('docs/' + name));
  if (!process.argv.includes('--reuse-browser')) run('stage5-5-browser.cjs');
  report.browser = JSON.parse(read('backend/.cache/rag/stage5-5-browser.json'));
  assert.ok(report.browser.completed && report.browser.dataPreserved && report.browser.tests.every(t => t.status === 'PASS'));
  assert.equal(report.browser.integration.realGeminiCalls, 1);
  report.realGeminiCalls = report.browser.integration.realGeminiCalls + (report.browser.previousAttempts || []).reduce((sum, attempt) => sum + attempt.realGeminiCalls, 0);
  report.regression.push({ suite: 'GĐ5.4 logic/API, Gemini mock', tests: [...await require('./stage5-4-logic.cjs').runLogic(), ...await require('./stage5-4-api.cjs').runApi()] });
  console.log('PASS: regression GĐ5.4 logic/API');
  for (const [script, file] of [
    ['stage4-2-api.cjs', 'stage4-2-api-results.json'],
    ['stage4-2-regression.cjs', 'stage4-2-regression-results.json'],
    ['stage2-browser.cjs', 'stage2-browser-results.json'],
    ['stage3-browser.cjs', 'stage3-browser-results.json'],
    ['stage4-4-browser.cjs', 'stage4-4-browser-results.json']
  ]) {
    try {
      run(script); const result = JSON.parse(read('docs/' + file));
      const tests = result.results || result.suites?.flatMap(suite => suite.results);
      assert.ok(tests?.length && tests.every(test => test.status === 'PASS'));
      report.regression.push({ suite: script, tests, dataPreserved: result.dataPreserved ?? null });
      console.log('PASS: ' + script + ' (' + tests.length + ')');
    } finally {
      if (script === 'stage3-browser.cjs') await cleanupTicket(JSON.parse(read('docs/' + file)));
      if (backups.has(file)) fs.writeFileSync(path.join(root, 'docs', file), backups.get(file));
    }
  }
  execFileSync(process.execPath, [path.join(root, 'frontend/node_modules/vite/bin/vite.js'), 'build'], { cwd: path.join(root, 'frontend'), stdio: 'pipe', timeout: 90000, windowsHide: true });
  report.build = { status: 'PASS', command: 'node node_modules/vite/bin/vite.js build', directory: 'frontend' };
  console.log('PASS: frontend build');
  const tracked = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  const secretKeys = ['GEMINI_API_KEY', 'JWT_SECRET', 'DB_PASSWORD', 'SEED_USER_PASSWORD'];
  for (const file of tracked) {
    assert.ok(!/(^|\/)(node_modules|dist|\.cache)\//.test(file));
    assert.ok(!/(^|\/)\.env(?:$|\.(?!example$))/.test(file));
    const bytes = read(file);
    for (const key of secretKeys) if (process.env[key]) assert.ok(!bytes.includes(Buffer.from(process.env[key])), 'SECRET_SCAN_FAILED');
    ensureNoSecrets(bytes.toString('utf8'));
  }
  assert.equal(git(['check-ignore', 'backend/.env']), 'backend/.env');
  const frontendFiles = fs.readdirSync(path.join(root, 'frontend/src')).filter(file => /\.(jsx|js)$/.test(file));
  for (const file of frontendFiles) assert.doesNotMatch(read('frontend/src/' + file).toString(), /GEMINI_API_KEY|generativelanguage\.googleapis|@google\/genai|dangerouslySetInnerHTML/);
  for (const file of fs.readdirSync(path.join(root, 'frontend/dist/assets'))) {
    const bytes = read('frontend/dist/assets/' + file);
    for (const key of secretKeys) if (process.env[key]) assert.ok(!bytes.includes(Buffer.from(process.env[key])), 'BUNDLE_SECRET_SCAN_FAILED');
    assert.ok(!bytes.includes(Buffer.from('GEMINI_API_KEY')));
  }
  assert.equal(git(['diff', '--name-only', 'HEAD', '--', 'backend/src', 'database']), '');
  git(['diff', '--check']);
  report.checks.push({ name: 'Repository và bundle không chứa giá trị secret local; .env ignore, không cache/vector/dependency artifact', status: 'PASS', filesScanned: tracked.length });
  report.checks.push({ name: 'Frontend không có key/provider SDK/direct call hoặc render HTML không kiểm soát', status: 'PASS' });
  report.checks.push({ name: 'Backend RAG và schema giữ nguyên', status: 'PASS' });
  const after = await snapshot(pool); assert.deepEqual(after, before); assert.ok(after.knowledge_articles.every(a => a.status === 'PUBLISHED'));
  report.databaseAfter = counts(after); report.dataPreserved = true; report.allKnowledgePublished = true;
  report.completed = true;
}
main().catch(error => { report.error = { name: error.name, suite: error.message.startsWith('REGRESSION_FAILED:') ? error.message : 'VALIDATION_FAILED' }; console.error('STAGE55_REGRESSION_FAILED: ' + report.error.suite); process.exitCode = 1; }).finally(async () => {
  for (const [name, bytes] of backups) fs.writeFileSync(path.join(root, 'docs', name), bytes);
  report.priorReportsPreserved = [...backups].every(([name, bytes]) => sha(read('docs/' + name)) === sha(bytes));
  report.stage53And54ReportHashes = Object.fromEntries(['docs/stage5-3-results.json', 'docs/stage5-4-results.json'].map(file => [file, sha(read(file))]));
  try { ensureNoSecrets(report); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); } finally { await pool.end(); }
});
