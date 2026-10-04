// Supplemental final-demo UI checks. Real API/MySQL, read-only; no RAG request.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const pool = require('../src/config/db');
const app = require('../src/app');
const { snapshot, counts } = require('../src/rag/retrievalExperiment');
const { ensureNoSecrets } = require('../src/rag/generationSafety');
const { chromium } = require(path.join(os.tmpdir(), 'it-support-browser-check/node_modules/playwright'));
const report = { stage: '6.4', testedAt: new Date().toISOString(), completed: false, mode: 'REAL_BROWSER_API_MYSQL_READ_ONLY', checks: [], evidence: [], geminiLiveRequests: 0 };
let before, browser, server, frontend;
const sha = value => createHash('sha256').update(value).digest('hex');
async function main() {
  before = await snapshot(pool);
  assert.deepEqual(counts(before), { users: 3, tickets: 3, ticket_history: 17, knowledge_articles: 8 });
  report.fingerprintBefore = sha(JSON.stringify(before));
  server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  frontend = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { cwd: path.join(root, 'frontend'), env: { ...process.env, VITE_API_URL: base }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let startup = ''; frontend.stdout.on('data', d => startup += d); frontend.stderr.on('data', d => startup += d);
  for (let i = 0; i < 150 && !startup.includes('http://127.0.0.1:5173'); i++) { assert.equal(frontend.exitCode, null); await new Promise(r => setTimeout(r, 100)); }
  assert.ok(startup.includes('http://127.0.0.1:5173'));
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  fs.mkdirSync(path.join(root, 'docs/evidence/stage6-4'), { recursive: true });
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } }); page.setDefaultTimeout(12000);
    const errors = []; page.on('pageerror', e => errors.push(e.name));
    async function check(screen, selector, imageName) {
      const entry = { screen, width, status: 'NOT RUN' }; report.checks.push(entry);
      try {
        await page.locator(selector).waitFor();
        const metrics = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
        assert.ok(metrics.scroll <= metrics.width + 1);
        for (const el of await page.locator(selector + ' input, ' + selector + ' textarea, ' + selector + ' button').all()) {
          if (!await el.isVisible()) continue;
          const b = await el.boundingBox(); assert.ok(b && b.width > 0 && b.x >= 0 && b.x + b.width <= width + 1);
        }
        ensureNoSecrets(await page.locator('body').innerText());
        assert.deepEqual(errors, []);
        if (imageName) {
          assert.ok((await page.locator('input[type=password]').all()).length === 0 || await page.locator('input[type=password]').inputValue() === '');
          const file = 'docs/evidence/stage6-4/' + imageName + '.png';
          await page.screenshot({ path: path.join(root, file), fullPage: true });
          report.evidence.push({ file, mode: report.mode, sha256: sha(fs.readFileSync(path.join(root, file))) });
        }
        entry.status = 'PASS'; entry.pageWidth = metrics.scroll;
      } catch (e) { entry.status = 'FAIL'; entry.errorType = e.name; throw e; }
    }
    async function login(role) {
      await page.getByLabel('Email', { exact: true }).fill(role.toLowerCase() + '@test.local');
      await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.SEED_USER_PASSWORD);
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
      await page.getByRole('heading', { name: /^Xin chào,/ }).waitFor();
      await page.getByRole('button', { name: /^TKT-/ }).first().waitFor();
    }
    await page.goto('http://127.0.0.1:5173');
    await check('Login', 'form', width === 1280 ? '01-login' : null);
    await login('EMPLOYEE');
    await check('Employee tickets', '.tickets', width === 1280 ? '02-employee-tickets' : null);
    await page.getByRole('button', { name: 'Tạo yêu cầu', exact: true }).click();
    await page.locator('#ticket-title').fill('Không kết nối được Wi-Fi văn phòng');
    await page.getByLabel('Mô tả sự cố', { exact: true }).fill('Tiếng Việt có dấu – nội dung nhập để kiểm tra bố cục, chưa gửi yêu cầu.');
    await check('Ticket form (unsent)', '.tickets', width === 1280 ? '03-create-ticket-unsent' : '11-mobile-ticket-form');
    await page.reload(); await page.getByRole('button', { name: /^TKT-/ }).first().click();
    await check('Ticket detail/history', '.ticket-detail', width === 1280 ? '05-ticket-history' : null);
    await page.getByRole('button', { name: 'Kho kiến thức', exact: true }).click();
    await page.locator('.kb-title').first().click();
    await check('Knowledge detail', '.kb-detail', null);
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await login('IT');
    await page.getByRole('button', { name: 'Kho kiến thức', exact: true }).click();
    await page.getByRole('button', { name: '+ Tạo bài', exact: true }).click();
    await page.locator('#kb-title').fill('Hướng dẫn tiếng Việt 😀 '.repeat(10));
    await page.locator('#kb-content').fill('Nội dung dài kiểm tra giao diện. '.repeat(80));
    await check('Knowledge editor (unsaved, long Unicode)', '.kb-form', width === 390 ? '12-mobile-knowledge-editor' : null);
    await page.getByRole('button', { name: 'Hủy', exact: true }).click();
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => sessionStorage.length), 0);
    await page.close();
  }
  report.completed = true;
}
main().catch(e => { report.errorType = e.name; process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (frontend && frontend.exitCode === null && frontend.signalCode === null) { const done = new Promise(r => frontend.once('exit', r)); frontend.kill(); await done; }
  if (server) await new Promise(r => { server.close(r); server.closeAllConnections(); });
  try { const after = await snapshot(pool); assert.deepEqual(after, before); report.fingerprintAfter = sha(JSON.stringify(after)); report.databasePreserved = true; }
  catch { report.databasePreserved = false; report.completed = false; process.exitCode = 1; }
  await pool.end(); report.finishedAt = new Date().toISOString(); ensureNoSecrets(report);
  fs.writeFileSync(path.join(root, 'backend/.cache/stage6-4-ui.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ completed: report.completed, checks: report.checks, databasePreserved: report.databasePreserved }));
});
