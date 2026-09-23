// Tổng hợp suite hiện có; giữ báo cáo cũ và không sửa bài seed thật.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const pool = require('../src/config/db');
const bcrypt = require('bcrypt');
const root = path.resolve(__dirname, '../..');
const report = { testedAt: new Date().toISOString(), completed: false, checks: [], suites: [], dataPreserved: false };
const backups = new Map();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
async function check(name, work) {
  try { await work(); report.checks.push({ name, status: 'PASS' }); console.log(`PASS: ${name}`); }
  catch (error) { report.checks.push({ name, status: 'FAIL' }); throw error; }
}
async function snapshot() {
  const data = {};
  for (const table of ['users', 'tickets', 'ticket_history', 'knowledge_articles']) [data[table]] = await pool.query(`SELECT * FROM ${table} ORDER BY id`);
  return data;
}
async function main() {
  assert.notEqual(process.env.NODE_ENV, 'production');
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(process.env.DB_HOST));
  const [[db]] = await pool.query('SELECT DATABASE() AS name'); assert.equal(db.name, 'it_support_rag');
  const before = await snapshot();
  await check('Dữ liệu ban đầu và tám bài seed hợp lệ', async () => {
    assert.deepEqual(Object.values(before).map(rows => rows.length), [3, 3, 17, 8]);
    const it = before.users.find(user => user.email === 'it@test.local');
    assert.equal(it.role, 'IT'); assert.equal(it.status, 'ACTIVE');
    assert.equal(new Set(before.knowledge_articles.map(a => a.code)).size, 8);
    const seeds = require('../src/utils/knowledgeSeedData');
    for (const article of before.knowledge_articles) {
      assert.match(article.code, /^KB-\d{6,}$/);
      assert.equal(article.code, `KB-${String(article.id).padStart(6, '0')}`);
      assert.equal(article.status, 'PUBLISHED'); assert.equal(article.created_by, it.id);
      assert.ok(article.title.trim() && article.content.trim());
    }
    for (const seed of seeds) assert.equal(before.knowledge_articles.filter(a => a.title === seed.title || a.content.includes(seed.marker)).length, 1);
  });
  await check('Schema thực tế: UNIQUE code, DRAFT mặc định, hai FK RESTRICT', async () => {
    const [[row]] = await pool.query('SHOW CREATE TABLE knowledge_articles'); const sql = row['Create Table'];
    assert.match(sql, /UNIQUE KEY[^\n]+\(`code`\)/);
    assert.match(sql, /DEFAULT 'DRAFT'/);
    assert.equal((sql.match(/REFERENCES `users` \(`id`\) ON DELETE RESTRICT/g) || []).length, 2);
    assert.match(sql, /ON UPDATE CURRENT_TIMESTAMP/i);
    const [tables] = await pool.query('SHOW TABLES');
    assert.deepEqual(tables.map(row => Object.values(row)[0]).sort(), Object.keys(before).sort());
  });
  await check('Ba mật khẩu demo là bcrypt cost 12 và so sánh thành công', async () => {
    for (const user of before.users) {
      assert.equal(bcrypt.getRounds(user.password), 12);
      assert.ok(await bcrypt.compare(process.env.SEED_USER_PASSWORD, user.password));
    }
  });
  await check('Git không chứa env thật, dependency, dist hoặc giá trị secret local', async () => {
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
    for (const file of tracked) {
      assert.ok(!/(^|\/)(node_modules|dist)\//.test(file));
      assert.ok(!/(^|\/)\.env(?:$|\.(?!example$))/.test(file));
      const bytes = fs.readFileSync(path.join(root, file));
      for (const key of ['DB_PASSWORD', 'JWT_SECRET', 'SEED_USER_PASSWORD']) if (process.env[key]) assert.ok(!bytes.includes(Buffer.from(process.env[key])), `Có secret trong ${file}`);
    }
    execFileSync('git', ['check-ignore', 'backend/.env'], { cwd: root });
  });
  await check('Source ứng dụng không có triển khai AI/RAG hoặc log token/mật khẩu', async () => {
    const files = execFileSync('git', ['ls-files', 'backend/src', 'frontend/src', 'backend/server.js', 'backend/package.json', 'frontend/package.json'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/);
    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(source, /qdrant|embedding|cosine|top[-_ ]?k\b|\bLLM\b|openai|gemini|semantic[ _-]retrieval|vector[ _-](?:database|search)/i);
      assert.doesNotMatch(source, /console\.(?:log|error|warn)\([^\n]*(?:req\.body|data\.token|process\.env\.(?:JWT_SECRET|SEED_USER_PASSWORD)|user\.password)/);
    }
    assert.match(read('backend/src/config/jwt.js'), /process\.env\.JWT_SECRET/);
    assert.match(read('backend/src/routes/knowledgeArticleRoutes.js'), /router\.use\(authenticate/);
    assert.match(read('backend/src/routes/knowledgeArticleRoutes.js'), /authorizeRoles\('IT', 'ADMIN'\)/);
    assert.doesNotMatch(read('backend/src/models/knowledgeArticleModel.js'), /\$\{(?:req\.|title|content|id|user\.)/);
  });
  await check('Seed giữ bài đã biên tập qua mô phỏng, không ghi database thật', async () => {
    const users = require('../src/models/userModel');
    const model = require('../src/models/knowledgeArticleModel');
    const { seedKnowledge } = require('../src/utils/seedKnowledge');
    const seeds = require('../src/utils/knowledgeSeedData');
    const original = { getConnection: pool.getConnection, findByEmail: users.findByEmail, create: model.create, changeStatus: model.changeStatus };
    const it = before.users.find(user => user.email === 'it@test.local');
    const edited = seeds.map((seed, index) => ({ ...before.knowledge_articles.find(a => a.title === seed.title || a.content.includes(seed.marker)), title: `Đã biên tập ${index}`, content: `Nội dung đã sửa ${seed.marker}`, status: 'ARCHIVED' }));
    const saved = structuredClone(edited); let released = false;
    try {
      users.findByEmail = async email => { assert.equal(email, it.email); return it; };
      pool.getConnection = async () => ({
        async execute(sql, params) {
          if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]];
          if (sql.startsWith('SELECT RELEASE_LOCK')) return [[{ released: 1 }]];
          assert.ok(sql.startsWith('SELECT id, code, title, content, status, created_by'));
          const index = seeds.findIndex(seed => seed.marker === params[1]); assert.ok(index >= 0);
          return [[edited[index]]];
        },
        release() { released = true; },
      });
      model.create = model.changeStatus = async () => { throw new Error('Seed không được ghi bài đã tồn tại'); };
      const result = await seedKnowledge();
      assert.equal(result.created, 0); assert.equal(result.skipped, 8);
      assert.deepEqual(edited, saved); assert.ok(released);
    } finally { pool.getConnection = original.getConnection; users.findByEmail = original.findByEmail; model.create = original.create; model.changeStatus = original.changeStatus; }
    assert.deepEqual(await snapshot(), before);
  });
  for (const file of ['stage4-4-browser-results.json', 'stage4-4-regression-results.json', 'stage4-4-knowledge.png']) {
    const full = path.join(root, 'docs', file); backups.set(full, fs.readFileSync(full));
  }
  for (const [script, resultFile] of [['stage4-4-browser.cjs', 'stage4-4-browser-results.json'], ['stage4-4-regression.cjs', 'stage4-4-regression-results.json']]) {
    execFileSync(process.execPath, [path.join(__dirname, script)], { cwd: path.join(root, 'backend'), stdio: 'inherit', timeout: 240000, windowsHide: true });
    const result = JSON.parse(read(`docs/${resultFile}`)); assert.equal(result.dataPreserved, true);
    if (result.results) { assert.equal(result.results.length, 39); assert.ok(result.results.every(item => item.status === 'PASS')); }
    else { assert.equal(result.suites.length, 4); assert.equal(result.seedIdempotency, true); }
    report.suites.push({ script, result });
  }
  await check('Dữ liệu cuối giữ nguyên toàn bộ bản ghi trước kiểm thử', async () => {
    const after = await snapshot(); assert.deepEqual(after, before);
    report.counts = Object.fromEntries(Object.entries(after).map(([table, rows]) => [table, rows.length]));
    report.articles = after.knowledge_articles.map(({ code, title, status }) => ({ code, title, status }));
    report.dataPreserved = true;
  });
  report.completed = true;
}
main().catch(error => { console.error('Kiểm thử tổng thất bại:', error.code || error.name); process.exitCode = 1; }).finally(async () => {
  for (const [file, content] of backups) fs.writeFileSync(file, content);
  fs.writeFileSync(path.join(root, 'docs/stage4-5-results.json'), JSON.stringify(report, null, 2) + '\n');
  await pool.end();
});
