const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { chromium } = require(path.join(os.tmpdir(), 'it-support-browser-check/node_modules/playwright'));
const pool = require('../src/config/db');
const { snapshot, counts } = require('../src/rag/retrievalExperiment');
const { ensureNoSecrets } = require('../src/rag/generationSafety');
const { fallback } = require('../src/rag/generationOutput');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'backend/.cache/rag/stage5-5-browser.json');
const report = { testedAt: new Date().toISOString(), completed: false, browser: 'Microsoft Edge headless', tests: [], integration: { realGeminiCalls: 0, requests: [] } };
if (fs.existsSync(output)) { const previous = JSON.parse(fs.readFileSync(output, 'utf8')); report.previousAttempts = [...(previous.previousAttempts || []), { testedAt: previous.testedAt, completed: previous.completed, tests: previous.tests, realGeminiCalls: previous.integration.realGeminiCalls, error: previous.error || null }]; }
const sessions = []; // Chỉ giữ đối tượng service để đóng model sau test, không lưu token.
// Instrumentation trong tiến trình test: đếm nhưng chuyển nguyên lời gọi tới SDK thật.
const geminiModule = require('../src/rag/geminiClient');
const originalClient = geminiModule.createGeminiClient;
geminiModule.createGeminiClient = (...args) => {
  const client = originalClient(...args);
  return { generate: async prompt => {
    assert.ok(report.integration.realGeminiCalls < 1, 'Không được gọi quá một request Gemini trong lượt test.');
    report.integration.realGeminiCalls++;
    return client.generate(prompt);
  } };
};
const generationModule = require('../src/rag/generationService');
const originalService = generationModule.createRagService;
generationModule.createRagService = (...args) => { const service = originalService(...args); sessions.push(service); return service; };
const app = require('../src/app');
geminiModule.createGeminiClient = originalClient;
generationModule.createRagService = originalService;
let browser, frontend, server, before, page, api;
const runtimeErrors = [], browserProviderRequests = [];
async function check(id, name, action, mode = 'BROWSER_REAL_AUTH_MOCK_RAG') {
  try { await action(); report.tests.push({ id, name, mode, status: 'PASS' }); console.log('PASS ' + id + ': ' + name); }
  catch (error) { report.tests.push({ id, name, mode, status: 'FAIL', error: error.name }); throw error; }
}
async function login(role) {
  await page.goto('http://127.0.0.1:5173');
  await page.getByLabel('Email', { exact: true }).fill(role + '@test.local');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.SEED_USER_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('heading', { name: /^Xin chào,/ }).waitFor();
}
async function logout() { await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click(); await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor(); }
const rag = () => page.getByRole('region', { name: 'Trợ lý hỗ trợ CNTT', exact: true });
const input = () => page.getByLabel('Câu hỏi của bạn', { exact: true });
const button = () => rag().locator('button[type=submit]');
const result = () => page.getByRole('article', { name: 'Kết quả hỏi đáp', exact: true });
async function openRag() { await page.getByRole('button', { name: 'Trợ lý CNTT', exact: true }).click(); await input().waitFor(); }
const fixture = { answered: true, answer: 'Dòng hướng dẫn thứ nhất.\nDòng hướng dẫn thứ hai.', sources: [{ code: 'KB-000008', title: 'Không kết nối được Wi-Fi', score: 0.91 }] };
async function stub(data, status = 200) { await page.unroute(api + '/rag/ask'); await page.route(api + '/rag/ask', route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })); }
async function send(question = 'Câu hỏi kiểm thử giao diện') { await input().fill(question); await button().click(); }
async function answerVisible() { await result().locator('.rag-answer').waitFor(); assert.equal(await button().isEnabled(), true); }
async function main() {
  assert.notEqual(process.env.NODE_ENV, 'production'); assert.ok(['127.0.0.1', 'localhost', '::1'].includes(process.env.DB_HOST));
  before = await snapshot(pool); report.databaseBefore = counts(before); assert.deepEqual(report.databaseBefore, { users: 3, tickets: 3, ticket_history: 17, knowledge_articles: 8 });
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); api = 'http://127.0.0.1:' + server.address().port + '/api';
  frontend = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { cwd: path.join(root, 'frontend'), env: { ...process.env, VITE_API_URL: api }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let startup = ''; frontend.stdout.on('data', data => startup += data); frontend.stderr.on('data', data => startup += data);
  for (let i = 0; i < 150 && !startup.includes('http://127.0.0.1:5173'); i++) { assert.equal(frontend.exitCode, null); await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.ok(startup.includes('http://127.0.0.1:5173'));
  browser = await chromium.launch({ channel: 'msedge', headless: true }); page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); page.setDefaultTimeout(12000);
  page.on('pageerror', error => runtimeErrors.push(error.name));
  page.on('request', request => { if (/generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com/.test(request.url())) browserProviderRequests.push('provider-request'); });
  await check(1, 'EMPLOYEE đăng nhập thật', () => login('employee'), 'REAL_LOGIN');
  await check(2, 'EMPLOYEE thấy mục Trợ lý CNTT', async () => assert.equal(await page.getByRole('button', { name: 'Trợ lý CNTT', exact: true }).count(), 1));
  await check(3, 'Mở giao diện hỏi đáp', openRag);
  let requestCount = 0;
  await page.route(api + '/rag/ask', route => { requestCount++; return route.fulfill({ json: fixture }); });
  await check(4, 'Rỗng và whitespace không gửi request', async () => { assert.equal(await button().isDisabled(), true); await input().fill('   '); await input().press('Enter'); assert.equal(await button().isDisabled(), true); assert.equal(requestCount, 0); });
  await check('4b', 'Giới hạn 1000 code point, không cắt sai emoji', async () => { await input().fill('x'.repeat(1001)); assert.equal(await button().isDisabled(), true); await input().press('Enter'); assert.equal(requestCount, 0); await input().fill('😀'.repeat(1000)); assert.equal(await button().isEnabled(), true); });
  await check('4c', 'Shift+Enter xuống dòng; IME Enter không gửi', async () => { await input().fill('Dòng một'); await input().press('Shift+Enter'); assert.ok((await input().inputValue()).includes('\n')); await input().dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true }); assert.equal(requestCount, 0); });
  let release, seen; const barrier = new Promise(resolve => release = resolve); const received = new Promise(resolve => seen = resolve);
  await page.unroute(api + '/rag/ask');
  await page.route(api + '/rag/ask', async route => { requestCount++; assert.deepEqual(route.request().postDataJSON(), { question: 'Hỏi Wi-Fi' }); assert.ok(route.request().headers().authorization?.startsWith('Bearer ')); seen(); await barrier; await route.fulfill({ json: fixture }); });
  await check(5, 'Gửi Enter, trim, body đúng và JWT hiện tại', async () => { await input().fill('  Hỏi Wi-Fi  '); await input().press('Enter'); await received; });
  await check(6, 'Loading, disable và chặn submit lặp', async () => { await rag().getByRole('status').waitFor(); assert.equal(await button().isDisabled(), true); assert.equal(await input().isDisabled(), true); await rag().locator('form').dispatchEvent('submit'); assert.equal(requestCount, 1); release(); });
  await check(7, 'Answer và câu hỏi hiển thị đúng; giữ xuống dòng', async () => { await answerVisible(); assert.equal(await result().locator('.rag-answer').textContent(), fixture.answer); assert.equal(await result().locator('p').first().textContent(), 'Hỏi Wi-Fi'); assert.equal(await result().locator('.rag-answer').evaluate(el => getComputedStyle(el).whiteSpace), 'pre-wrap'); });
  await check(8, 'Sources chỉ có code/title backend trả', async () => { assert.equal(await result().locator('.rag-sources li').count(), 1); assert.equal(await result().locator('.rag-sources li').textContent(), 'KB-000008 — Không kết nối được Wi-Fi'); });
  await check(10, 'Fallback không giữ answer/nguồn cũ hoặc tự bịa', async () => { await stub(fallback()); await send(); await answerVisible(); assert.equal(await result().locator('.rag-answer').textContent(), fallback().answer); assert.equal(await result().locator('.rag-sources').count(), 0); });
  await check(11, 'EMPLOYEE sang Ticket, không tự POST tạo yêu cầu', async () => { let posts = 0; const track = req => { if (req.url() === api + '/tickets' && req.method() === 'POST') posts++; }; page.on('request', track); await result().getByRole('button', { name: 'Tạo yêu cầu hỗ trợ', exact: true }).click(); await page.getByRole('heading', { name: 'Yêu cầu hỗ trợ của tôi', exact: true }).waitFor(); await page.getByRole('button', { name: 'Tạo yêu cầu', exact: true }).click(); await page.getByLabel('Mô tả sự cố', { exact: true }).waitFor(); assert.equal(posts, 0); page.off('request', track); });
  for (const [role, ids] of [['it', [12, 13]], ['admin', [14, 15]]]) {
    await logout(); await login(role);
    await check(ids[0], role.toUpperCase() + ' mở Trợ lý CNTT', openRag);
    await check(ids[1], role.toUpperCase() + ' nhận answer; fallback không có nút tạo Ticket', async () => { await stub(fixture); await send(); await answerVisible(); assert.equal(await result().locator('.rag-answer').textContent(), fixture.answer); await stub(fallback()); await send(); await answerVisible(); assert.equal(await result().getByRole('button', { name: 'Tạo yêu cầu hỗ trợ' }).count(), 0); });
  }
  await check(16, '401 xóa phiên, về login; không hiển thị raw lỗi', async () => { await stub({ code: 'UNAUTHORIZED', message: 'RAW_PRIVATE_DIAGNOSTIC' }, 401); await send(); await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor(); assert.equal(await page.evaluate(() => sessionStorage.getItem('it_support_token')), null); assert.ok(!(await page.locator('body').textContent()).includes('RAW_PRIVATE_DIAGNOSTIC')); });
  await login('employee'); await openRag();
  for (const [id, status, code, fragment] of [
    [17, 403, 'FORBIDDEN', 'không có quyền'], [18, 429, 'RAG_BUSY', 'đang bận'], [19, 500, 'RAG_ERROR', 'tạm thời không khả dụng'],
    ['E400', 400, 'INVALID_QUESTION', 'không hợp lệ'], ['E404', 404, 'NOT_FOUND', 'Không tìm thấy'], ['E503', 503, 'GEMINI_RATE_LIMIT', 'hết hạn mức'],
    ['E502', 502, 'GEMINI_INVALID_EVIDENCE', 'Chưa xác minh'], ['E504', 504, 'GEMINI_TIMEOUT', 'quá nhiều thời gian']
  ]) await check(id, 'Xử lý HTTP ' + status + ' / ' + code, async () => { await stub({ code, message: 'RAW_PRIVATE_DIAGNOSTIC' }, status); await send(); await rag().getByRole('alert').waitFor(); const text = await rag().getByRole('alert').textContent(); assert.ok(text.includes(fragment)); assert.ok(!text.includes('RAW_PRIVATE_DIAGNOSTIC')); assert.equal(await result().count(), 0); assert.equal(await button().isEnabled(), true); });
  await check(20, 'Network error và gửi lại sau lỗi', async () => { await page.unroute(api + '/rag/ask'); await page.route(api + '/rag/ask', route => route.abort('failed')); await send(); await rag().getByRole('alert').waitFor(); assert.ok((await rag().getByRole('alert').textContent()).includes('Không kết nối')); await stub(fixture); await send(); await answerVisible(); });
  await check('EJSON', 'Response sai contract không crash hoặc tự tạo answer', async () => { await stub({ answered: true, answer: 'Không có sources' }); await send(); await rag().getByRole('alert').waitFor(); assert.equal(await result().count(), 0); });
  await check(23, 'Answer và source được render text, không thực thi HTML', async () => { const attack = '<img src=x onerror="window.stage55Xss=1">\n<script>window.stage55Xss=2</script>'; await stub({ answered: true, answer: attack, sources: [{ code: 'KB-TEST', title: attack }] }); await send(); await answerVisible(); assert.equal(await result().locator('img, script').count(), 0); assert.equal(await page.evaluate(() => window.stage55Xss), undefined); assert.equal(await result().locator('.rag-answer').textContent(), attack); });
  await check(25, 'Màn hình 390px không tràn; form và nguồn đọc được', async () => { await page.setViewportSize({ width: 390, height: 844 }); await stub({ ...fixture, answer: 'Nội dung '.repeat(60), sources: [{ code: 'KB-000008', title: 'Tiêu đề dài '.repeat(15) }] }); await send('Câu hỏi trên điện thoại'); await answerVisible(); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)); const box = await input().boundingBox(); assert.ok(box.width > 200 && box.x >= 0 && box.x + box.width <= 390); await page.screenshot({ path: path.join(os.tmpdir(), 'stage5-5-mobile.png'), fullPage: true }); await page.setViewportSize({ width: 1280, height: 900 }); });
  await check('LIFECYCLE', 'Chuyển tab khi request đang chạy không làm rò kết quả', async () => { await page.unroute(api + '/rag/ask'); let finish; const gate = new Promise(resolve => finish = resolve); let began; const start = new Promise(resolve => began = resolve); await page.route(api + '/rag/ask', async route => { began(); await gate; await route.fulfill({ json: fixture }).catch(() => {}); }); await send(); await start; await page.getByRole('button', { name: 'Kho kiến thức', exact: true }).click(); finish(); await page.getByRole('list', { name: 'Danh sách bài viết' }).waitFor(); await openRag(); assert.equal(await result().count(), 0); assert.equal(await input().inputValue(), ''); });
  await page.unroute(api + '/rag/ask');
  await check(9, 'Ngoài KB: browser → backend/retrieval thật → fallback, không Gemini', async () => { const pending = page.waitForResponse(r => r.url() === api + '/rag/ask', { timeout: 60000 }); await send('Nhân viên mới có bao nhiêu ngày nghỉ phép năm?'); const response = await pending; const data = await response.json(); report.integration.requests.push({ kind: 'OUT_OF_KB', httpStatus: response.status(), response: data }); assert.equal(response.status(), 200); assert.deepEqual(data, fallback()); await answerVisible(); assert.equal(report.integration.realGeminiCalls, 0); }, 'REAL_BACKEND_RETRIEVAL');
  if (!process.argv.includes('--mock-only')) await check(29, 'Browser → API JWT → retrieval → Gemini thật → answer/sources', async () => { const pending = page.waitForResponse(r => r.url() === api + '/rag/ask', { timeout: 60000 }); await send('Không kết nối được Wi-Fi thì cần kiểm tra gì trước?'); const response = await pending; const data = await response.json(); ensureNoSecrets(data); report.integration.requests.push({ kind: 'GEMINI_ANSWER', httpStatus: response.status(), response: data }); assert.equal(response.status(), 200); assert.equal(data.answered, true); assert.ok(data.sources.some(s => s.code === 'KB-000008')); await answerVisible(); assert.equal(await result().locator('.rag-answer').textContent(), data.answer); assert.deepEqual(await result().locator('.rag-sources li').allTextContents(), data.sources.map(s => s.code + ' — ' + s.title)); assert.equal(report.integration.realGeminiCalls, 1); await page.screenshot({ path: path.join(os.tmpdir(), 'stage5-5-desktop.png'), fullPage: true }); }, 'REAL_GEMINI');
  await check(22, 'Browser không gọi Google/Gemini trực tiếp', async () => assert.deepEqual(browserProviderRequests, []), 'BROWSER_REQUEST_OBSERVATION');
  await check('RUNTIME', 'Không có lỗi JavaScript frontend', async () => assert.deepEqual(runtimeErrors, []));
  report.completed = true;
}
main().catch(error => { report.error = { name: error.name }; console.error('STAGE55_BROWSER_FAILED: ' + error.name); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (frontend && frontend.exitCode === null) { const stopped = new Promise(resolve => frontend.once('exit', resolve)); frontend.kill(); await stopped; }
  if (server) await new Promise(resolve => server.close(resolve));
  for (const service of sessions) await service.dispose();
  try { if (before) { const after = await snapshot(pool); assert.deepEqual(after, before); report.databaseAfter = counts(after); report.dataPreserved = true; report.allKnowledgePublished = after.knowledge_articles.every(a => a.status === 'PUBLISHED'); } }
  catch { report.dataPreserved = false; report.completed = false; process.exitCode = 1; }
  try { ensureNoSecrets(report); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); } finally { await pool.end(); }
});
