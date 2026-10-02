// GĐ6.2: browser -> API -> MySQL thật; chỉ provider Gemini và ca UI lỗi ghi rõ MOCK.
// Chạy: node tests/stage6-2-e2e.cjs (trong backend). Không sửa source hoặc dữ liệu gốc.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { chromium } = require(path.join(os.tmpdir(), 'it-support-browser-check/node_modules/playwright'));
const pool = require('../src/config/db');
const { snapshot, counts } = require('../src/rag/retrievalExperiment');
const { ensureNoSecrets } = require('../src/rag/generationSafety');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'docs/stage6-2-results.json');
const evidenceDir = path.join(root, 'docs/evidence/stage6-2');
const marker = '[E2E-6.2 ' + randomUUID().slice(0, 8) + ']';
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 8e6 }).trim();
const sha = value => createHash('sha256').update(value).digest('hex');
const report = {
  stage: '6.2', testedAt: new Date().toISOString(), completed: false,
  git: { baseCommit: git(['rev-parse', 'HEAD']), branch: git(['branch', '--show-current']) },
  environment: { node: process.version, platform: process.platform, browser: 'Microsoft Edge headless', playwright: require(path.join(os.tmpdir(), 'it-support-browser-check/node_modules/playwright/package.json')).version },
  database: {}, e2e: {}, responsive: { checks: [] }, previous_p2_review: {},
  regression: { suites: [] }, frontend_build: { status: 'NOT RUN' }, gemini_real_requests: 0,
  provider: { mode: 'MOCK_SDK_GENERATE_CONTENT', calls: 0, traces: [] },
  security: {}, issues: { P0: [], P1: [], P2: [], P3: [] }, evidence: [],
  temporaryData: { users: [], tickets: [], articles: [] },
  recommendation_for_stage6_3: []
};
if (fs.existsSync(output)) {
  const old = readJson('docs/stage6-2-results.json');
  report.previousAttempts = [...(old.previousAttempts || []), { testedAt: old.testedAt, completed: old.completed, e2e: old.e2e, cleanup: old.cleanup, infrastructureError: old.infrastructureError || null }];
}
let browser, frontend, server, api, before, activeStep, activeGroup, ticket, kbArticle;
let providerMode = 'NORMAL', providerGate = null, providerEntered = null;
const services = [], pages = {}, sessions = {}, originals = new Map();
const errors = [], requests = [], temporary = { users: [], tickets: [], articles: [] };
const geminiModule = require('../src/rag/geminiClient');
const originalClient = geminiModule.createGeminiClient;
geminiModule.createGeminiClient = () => originalClient({ clientFactory: () => ({
  models: { async generateContent(request) {
    report.provider.calls++;
    if (providerEntered) providerEntered();
    if (providerGate) await providerGate;
    const data = JSON.parse(request.contents[0].parts[0].text);
    assert.ok(data.CONTEXT.length && data.CONTEXT.every(c => before.knowledge_articles.some(a => a.code === c.code && a.status === 'PUBLISHED')));
    let raw;
    if (providerMode !== 'NORMAL') {
      const historical = readJson('docs/stage5-4-results.json').questions.find(q => q.id === providerMode);
      assert.equal(data.QUESTION, historical.question);
      raw = historical.trace.rawGeneration || JSON.stringify({
        answered: historical.response.answered, answer: historical.response.answer,
        evidence: historical.trace.evidence.map(e => e.quote)
      });
    } else {
      const quote = data.CONTEXT[0].content.slice(0, 180);
      raw = JSON.stringify({ answered: true, answer: '[MOCK Gemini] Hướng dẫn từ nguồn:\n' + quote, evidence: [quote] });
    }
    ensureNoSecrets(raw);
    return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: raw }] } }] };
  } }
}) });
const generationModule = require('../src/rag/generationService');
const originalService = generationModule.createRagService;
generationModule.createRagService = (...args) => {
  const service = originalService(...args); services.push(service);
  return { ...service, async ask(question) {
    const result = await service.ask(question);
    report.provider.traces.push({ question, geminiCalled: result.trace.geminiCalled, reason: result.trace.reason,
      sources: result.response.sources.map(s => s.code), context: result.trace.context.map(c => c.code) });
    return result;
  } };
};
const app = require('../src/app');
geminiModule.createGeminiClient = originalClient;
generationModule.createRagService = originalService;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function safeResponse(value) {
  ensureNoSecrets(value);
  if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    assert.ok(!/password|hash|secret|stack/i.test(key)); if (item && typeof item === 'object') safeResponse(item);
  }
}
async function step(name, expected, action, mode = 'BROWSER_API_MYSQL') {
  activeStep = name;
  const result = { name, expected, mode, status: 'NOT RUN' };
  activeGroup.checks.push(result);
  try { const observation = await action(); result.status = 'PASS'; if (observation !== undefined) result.observed = observation; }
  catch (error) {
    result.status = 'FAIL'; result.actual = error.safeActual || error.name;
    result.evidence = 'docs/stage6-2-results.json'; result.severity = 'P2'; result.proposed_stage = '6.3'; throw error;
  }
}
async function flow(id, name, action) {
  activeGroup = report.e2e[id] = { name, status: 'NOT RUN', checks: [] };
  try { await action(); activeGroup.status = 'PASS'; }
  catch (error) { activeGroup.status = 'FAIL'; activeGroup.failedStep = activeStep; activeGroup.errorType = error.name; }
  console.log(id + ': ' + activeGroup.status);
}
async function apiCall(route, status, session, method = 'GET', body) {
  const response = await fetch(api + route, { method, headers: { ...(session ? { Authorization: 'Bearer ' + session.token } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  if (response.status !== status) throw Object.assign(new Error('HTTP_ASSERTION'), { safeActual: 'HTTP ' + response.status + ', expected ' + status });
  if (route !== '/auth/login') safeResponse(data); else if (data.user) safeResponse(data.user);
  return data;
}
async function newPage() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.name));
  page.on('request', req => {
    if (req.url().startsWith(api)) requests.push({ method: req.method(), path: req.url().slice(api.length) });
    if (/generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com/.test(req.url())) errors.push('DIRECT_PROVIDER_REQUEST');
  });
  return page;
}
const nav = (p, name) => p.getByRole('navigation').getByRole('button', { name, exact: true }).click();
const detail = p => p.getByRole('article', { name: 'Chi tiết Ticket', exact: true });
const article = p => p.getByRole('article', { name: 'Chi tiết bài viết', exact: true });
const rag = p => p.locator('.rag-assistant');
async function login(role, page = pages[role]) {
  await page.goto('http://127.0.0.1:5173');
  await page.getByLabel('Email', { exact: true }).fill(role.toLowerCase() + '@test.local');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.SEED_USER_PASSWORD);
  const pending = page.waitForResponse(r => r.url() === api + '/auth/login' && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  const response = await pending; assert.equal(response.status(), 200);
  sessions[role] = await response.json(); assert.equal(sessions[role].user.role, role);
  await page.getByRole('heading', { name: /^Xin chào,/ }).waitFor();
  await page.getByRole('button', { name: 'Làm mới danh sách', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('.tickets button')?.disabled);
}
async function uiWrite(page, route, method, button, expected = 200) {
  const pending = page.waitForResponse(r => r.url() === api + route && r.request().method() === method);
  await button.click(); const response = await pending;
  if (response.status() !== expected) throw Object.assign(new Error('HTTP_ASSERTION'), { safeActual: 'HTTP ' + response.status() + ', expected ' + expected });
  const value = await response.json(); safeResponse(value); return value;
}
async function ticketState(page, name) { await detail(page).locator('dd').filter({ hasText: new RegExp('^' + name + '$') }).waitFor(); }
async function openTicket(page) {
  await nav(page, page === pages.EMPLOYEE ? 'Ticket của tôi' : 'Ticket');
  await page.getByRole('button', { name: ticket.code, exact: true }).click(); await detail(page).waitFor();
}
async function ticketAction(page, label, action, state) {
  const value = await uiWrite(page, '/tickets/' + ticket.id + '/' + action, 'PATCH', detail(page).getByRole('button', { name: label, exact: true }));
  if (state) await ticketState(page, state); return value.ticket;
}
async function openKb(page) {
  await nav(page, 'Trợ lý CNTT');
  await nav(page, 'Kho kiến thức'); await page.getByLabel('Tìm kiếm hướng dẫn', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('#kb-search') && !document.querySelector('#kb-search').disabled);
}
async function kbDetail(page, a = kbArticle) {
  await page.getByRole('button', { name: a.code + ' — ' + a.title, exact: true }).click(); await article(page).waitFor();
}
async function kbStatus(page, label, status) {
  const data = await uiWrite(page, '/knowledge/' + kbArticle.id + '/status', 'PATCH', article(page).getByRole('button', { name: label, exact: true }));
  assert.equal(data.article.status, status); kbArticle = data.article;
  await page.waitForFunction(() => !document.querySelector('.knowledge .actions button')?.disabled);
}
async function screenshot(page, name) {
  const text = await page.locator('body').innerText(); ensureNoSecrets(text);
  assert.equal(await page.locator('input[type=password]').count(), 0);
  const file = 'docs/evidence/stage6-2/' + name + '.png';
  await page.screenshot({ path: path.join(root, file), fullPage: true });
  report.evidence.push({ file, mode: name.includes('rag') ? 'MOCK_PROVIDER_OR_REAL_THRESHOLD' : 'REAL_BROWSER', sha256: sha(fs.readFileSync(path.join(root, file))) });
}
async function createUser(role) {
  const email = 'e2e62-' + randomUUID() + '@test.local';
  const { user } = await apiCall('/users', 201, sessions.ADMIN, 'POST', { name: marker + ' ' + role, email, role, password: process.env.SEED_USER_PASSWORD });
  temporary.users.push({ id: user.id, email }); report.temporaryData.users.push({ id: user.id, role });
  return apiCall('/auth/login', 200, null, 'POST', { email, password: process.env.SEED_USER_PASSWORD });
}
async function getTicket() { return (await apiCall('/tickets/' + ticket.id, 200, sessions.EMPLOYEE)).ticket; }
async function openRag(page) { await nav(page, 'Trợ lý CNTT'); await page.getByLabel('Câu hỏi của bạn').waitFor(); }
async function ask(page, question, status = 200) {
  await page.getByLabel('Câu hỏi của bạn').fill(question);
  const pending = page.waitForResponse(r => r.url() === api + '/rag/ask' && r.request().method() === 'POST', { timeout: 60000 });
  await rag(page).locator('button[type=submit]').click();
  const response = await pending; assert.equal(response.status(), status);
  const data = await response.json(); safeResponse(data);
  if (status === 200) await rag(page).locator('.rag-result').waitFor(); else await rag(page).getByRole('alert').waitFor();
  return data;
}

async function runFlows() {
  await flow('flow1', 'EMPLOYEE tạo Ticket', async () => {
    const p = pages.EMPLOYEE;
    await step('Login và role', 'EMPLOYEE đăng nhập bằng UI thật', () => login('EMPLOYEE'));
    await step('Validation và tạo Ticket', 'Rỗng bị chặn; POST 201, NEW/LOW, đúng creator', async () => {
      await p.getByRole('button', { name: 'Tạo yêu cầu', exact: true }).click();
      const posts = requests.filter(r => r.method === 'POST' && r.path === '/tickets').length;
      await p.getByRole('button', { name: 'Gửi yêu cầu', exact: true }).click();
      assert.equal(await p.locator('#ticket-title').evaluate(el => el.validity.valueMissing), true);
      assert.equal(requests.filter(r => r.method === 'POST' && r.path === '/tickets').length, posts);
      await p.getByLabel('Tiêu đề', { exact: true }).fill(marker + ' Kiểm tra Ticket');
      await p.getByLabel('Mô tả sự cố', { exact: true }).fill('Ticket tạm phục vụ kiểm thử End-to-End GĐ6.2.');
      ticket = (await uiWrite(p, '/tickets', 'POST', p.getByRole('button', { name: 'Gửi yêu cầu', exact: true }), 201)).ticket;
      temporary.tickets.push({ id: ticket.id, code: ticket.code, title: ticket.title, created_by: ticket.created_by });
      report.temporaryData.tickets.push({ id: ticket.id, code: ticket.code });
      assert.equal(ticket.created_by, sessions.EMPLOYEE.user.id); assert.equal(ticket.status, 'NEW');
      assert.equal(ticket.priority, 'LOW'); assert.equal(ticket.assigned_to, null);
      await ticketState(p, 'Mới'); const saved = await getTicket();
      assert.equal(saved.history.length, 1); assert.equal(saved.history[0].old_status, null);
      assert.equal(saved.history[0].new_status, 'NEW'); assert.equal(saved.history[0].actor_id, sessions.EMPLOYEE.user.id);
      await screenshot(p, '01-employee-ticket'); return { id: ticket.id, code: ticket.code, status: ticket.status };
    });
    await step('List/detail/reload', 'Ticket tồn tại sau reload, dữ liệu MySQL đúng', async () => {
      await p.reload(); await p.getByRole('button', { name: ticket.code, exact: true }).click(); await ticketState(p, 'Mới');
      const [[row]] = await pool.execute('SELECT code,status,created_by FROM tickets WHERE id=?', [ticket.id]);
      assert.equal(row.code, ticket.code); assert.equal(row.created_by, sessions.EMPLOYEE.user.id);
    });
  });
  await flow('flow2', 'IT tiếp nhận và xử lý', async () => {
    assert.ok(ticket); const p = pages.IT;
    await step('IT login và tiếp nhận', 'assigned_to là IT, NEW → RECEIVED', async () => {
      await login('IT'); await openTicket(p); const received = await ticketAction(p, 'Tiếp nhận', 'accept', 'Đã tiếp nhận');
      assert.equal(received.assigned_to, sessions.IT.user.id);
    });
    await step('Priority và bắt đầu xử lý', 'LOW/MEDIUM/HIGH thủ công; RECEIVED → IN_PROGRESS', async () => {
      for (const value of ['MEDIUM', 'LOW', 'HIGH']) {
        await detail(p).getByLabel('Độ ưu tiên mới').selectOption(value);
        const changed = await ticketAction(p, 'Lưu độ ưu tiên', 'priority'); assert.equal(changed.priority, value);
      }
      await ticketAction(p, 'Bắt đầu xử lý', 'status', 'Đang xử lý');
      const saved = await getTicket();
      assert.deepEqual(saved.history.map(h => h.new_status), ['NEW', 'RECEIVED', 'IN_PROGRESS']);
      assert.ok(saved.history.slice(1).every(h => h.actor_id === sessions.IT.user.id));
      await screenshot(p, '02-it-processing');
      return { status: saved.status, historyCount: saved.history.length, actorField: 'actor_id' };
    });
  });
  await flow('flow3', 'Solution, RESOLVED và EMPLOYEE xem kết quả', async () => {
    assert.ok(ticket); const p = pages.IT;
    await step('Thiếu solution không đổi trạng thái/history', 'UI chặn rỗng; API 400; DB không đổi', async () => {
      const saved = await getTicket();
      await detail(p).getByRole('button', { name: 'Đánh dấu đã giải quyết', exact: true }).click();
      assert.equal(await p.locator('#ticket-solution').evaluate(el => el.validity.valueMissing), true);
      await apiCall('/tickets/' + ticket.id + '/status', 400, sessions.IT, 'PATCH', { status: 'RESOLVED' });
      assert.deepEqual(await getTicket(), saved);
    });
    await step('RESOLVED có solution', 'Lưu solution, history đúng', async () => {
      await p.getByLabel('Giải pháp xử lý').fill(marker + ' Đã kiểm tra kết nối và xác nhận hoạt động.');
      await ticketAction(p, 'Đánh dấu đã giải quyết', 'status', 'Đã giải quyết');
      const saved = await getTicket(); assert.ok(saved.solution.includes(marker)); assert.equal(saved.history.length, 4);
    });
    await step('EMPLOYEE đăng nhập lại xem solution', 'Thấy RESOLVED; không có nút xử lý/đóng', async () => {
      const e = pages.EMPLOYEE; await e.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
      await login('EMPLOYEE'); await openTicket(e); await ticketState(e, 'Đã giải quyết');
      assert.ok((await detail(e).innerText()).includes((await getTicket()).solution));
      for (const name of ['Đóng Ticket', 'Xử lý lại', 'Tiếp nhận']) assert.equal(await detail(e).getByRole('button', { name, exact: true }).count(), 0);
      await screenshot(e, '03-resolved-solution');
    });
    await step('Xử lý lại rồi CLOSED', 'RESOLVED → IN_PROGRESS → RESOLVED → CLOSED; không mở CLOSED', async () => {
      await ticketAction(p, 'Xử lý lại', 'status', 'Đang xử lý');
      await p.getByLabel('Giải pháp xử lý').fill(marker + ' Đã kiểm tra lại lần hai.');
      await ticketAction(p, 'Đánh dấu đã giải quyết', 'status', 'Đã giải quyết');
      await ticketAction(p, 'Đóng Ticket', 'status', 'Đã đóng');
      const saved = await getTicket();
      assert.deepEqual(saved.history.map(h => h.new_status), ['NEW', 'RECEIVED', 'IN_PROGRESS', 'RESOLVED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
      await apiCall('/tickets/' + ticket.id + '/status', 409, sessions.IT, 'PATCH', { status: 'IN_PROGRESS' });
      assert.deepEqual(await getTicket(), saved);
    });
  });
  await flow('flow4', 'Ticket negative / backend RBAC', async () => {
    await step('Chuẩn bị user đối chiếu', 'Chỉ tạo 2 user tạm cần cho IDOR/assigned khác IT', async () => {
      await login('ADMIN'); sessions.OTHER_EMPLOYEE = await createUser('EMPLOYEE'); sessions.OTHER_IT = await createUser('IT');
    }, 'REAL_API_MYSQL');
    await step('EMPLOYEE trái quyền và IDOR', '403, body gán người xử lý 400; dữ liệu không đổi', async () => {
      const saved = await getTicket();
      for (const action of ['accept', 'priority', 'status']) await apiCall('/tickets/' + ticket.id + '/' + action, 403, sessions.EMPLOYEE, 'PATCH', {});
      await apiCall('/tickets', 400, sessions.EMPLOYEE, 'POST', { title: marker, description: 'Test', assigned_to: sessions.IT.user.id });
      await apiCall('/tickets/' + ticket.id, 403, sessions.OTHER_EMPLOYEE);
      const list = await apiCall('/tickets', 200, sessions.OTHER_EMPLOYEE); assert.ok(!list.tickets.some(t => t.id === ticket.id));
      assert.deepEqual(await getTicket(), saved);
    }, 'REAL_API_MYSQL');
    await step('IT khác không xử lý; thiếu token/ID/sai role', '403 / 401 / 404 đúng thiết kế', async () => {
      for (const action of ['priority', 'status']) await apiCall('/tickets/' + ticket.id + '/' + action, 403, sessions.OTHER_IT, 'PATCH', action === 'priority' ? { priority: 'LOW' } : { status: 'IN_PROGRESS' });
      await apiCall('/tickets', 401); await apiCall('/tickets/2147483647', 404, sessions.IT);
      for (const session of [sessions.IT, sessions.ADMIN]) await apiCall('/tickets', 403, session, 'POST', { title: marker, description: 'Test' });
    }, 'REAL_API_MYSQL');
  });
  await flow('flow5', 'Knowledge Base bằng UI thật', async () => {
    const p = pages.IT, e = pages.EMPLOYEE;
    await step('EMPLOYEE list/search/detail PUBLISHED', '8 bài PUBLISHED, không có nút quản trị', async () => {
      await openKb(e); const list = await apiCall('/knowledge', 200, sessions.EMPLOYEE);
      assert.equal(list.articles.length, 8); assert.ok(list.articles.every(a => a.status === 'PUBLISHED'));
      const wifi = before.knowledge_articles.find(a => a.title.includes('Wi-Fi'));
      await e.getByLabel('Tìm kiếm hướng dẫn').fill('  wI-fI  ');
      assert.equal(await e.locator('.kb-list li').count(), 1); await kbDetail(e, wifi);
      assert.equal(await article(e).getByRole('button', { name: 'Sửa bài', exact: true }).count(), 0);
      assert.equal(await e.getByRole('button', { name: '+ Tạo bài', exact: true }).count(), 0);
      assert.equal(await article(e).locator('.kb-content').textContent(), wifi.content);
      await screenshot(e, '04-employee-kb');
    });
    await step('IT tạo DRAFT và sửa', 'Code/creator giữ nguyên, updated_by là IT', async () => {
      await openKb(p); await p.getByRole('button', { name: '+ Tạo bài', exact: true }).click();
      await p.getByLabel('Tiêu đề', { exact: true }).fill(marker + ' KB tạm');
      await p.getByLabel('Nội dung', { exact: true }).fill(marker + ' Nội dung phục vụ E2E, không phải bài seed.');
      kbArticle = (await uiWrite(p, '/knowledge', 'POST', p.getByRole('button', { name: 'Lưu bài viết', exact: true }), 201)).article;
      temporary.articles.push({ id: kbArticle.id, code: kbArticle.code, created_by: kbArticle.created_by });
      report.temporaryData.articles.push({ id: kbArticle.id, code: kbArticle.code });
      assert.equal(kbArticle.status, 'DRAFT'); assert.equal(kbArticle.created_by, sessions.IT.user.id);
      await article(p).getByRole('button', { name: 'Sửa bài', exact: true }).click();
      await p.getByLabel('Tiêu đề', { exact: true }).fill(marker + ' KB đã sửa');
      await p.getByLabel('Nội dung', { exact: true }).fill(marker + ' Nội dung đã sửa qua giao diện.');
      const updated = (await uiWrite(p, '/knowledge/' + kbArticle.id, 'PUT', p.getByRole('button', { name: 'Lưu bài viết', exact: true }))).article;
      assert.equal(updated.code, kbArticle.code); assert.equal(updated.created_by, kbArticle.created_by);
      assert.equal(updated.updated_by, sessions.IT.user.id); kbArticle = updated;
      await screenshot(p, '05-it-kb');
    });
    await step('Publish/Archive/Draft và visibility EMPLOYEE', 'Vòng trạng thái đúng, EMPLOYEE chỉ thấy khi PUBLISHED', async () => {
      await apiCall('/knowledge/' + kbArticle.id, 403, sessions.EMPLOYEE);
      await kbStatus(p, 'Xuất bản', 'PUBLISHED');
      await openKb(e); await e.getByRole('button', { name: kbArticle.code + ' — ' + kbArticle.title, exact: true }).waitFor();
      await kbDetail(e); assert.ok((await article(e).innerText()).includes(marker));
      await kbStatus(p, 'Lưu trữ', 'ARCHIVED');
      await apiCall('/knowledge/' + kbArticle.id, 403, sessions.EMPLOYEE);
      await openKb(e);
      assert.equal(await e.getByRole('button', { name: kbArticle.code + ' — ' + kbArticle.title, exact: true }).count(), 0);
      await kbStatus(p, 'Chuyển về bản nháp', 'DRAFT');
    });
  });
  await flow('flow6', 'KB backend RBAC', async () => {
    await step('EMPLOYEE không ghi/đọc DRAFT', 'POST/PUT/PATCH status/detail đều 403', async () => {
      assert.ok(kbArticle);
      await apiCall('/knowledge', 403, sessions.EMPLOYEE, 'POST', { title: marker, content: marker });
      await apiCall('/knowledge/' + kbArticle.id, 403, sessions.EMPLOYEE, 'PUT', { title: marker, content: marker });
      await apiCall('/knowledge/' + kbArticle.id + '/status', 403, sessions.EMPLOYEE, 'PATCH', { status: 'PUBLISHED' });
      await apiCall('/knowledge/' + kbArticle.id, 403, sessions.EMPLOYEE);
    }, 'REAL_API_MYSQL');
    await step('ADMIN quản lý bài của IT', 'Sửa DRAFT, giữ creator/code, updated_by ADMIN', async () => {
      const a = (await apiCall('/knowledge/' + kbArticle.id, 200, sessions.ADMIN, 'PUT', { title: marker + ' ADMIN sửa', content: marker + ' Nội dung ADMIN.' })).article;
      assert.equal(a.created_by, sessions.IT.user.id); assert.equal(a.updated_by, sessions.ADMIN.user.id); assert.equal(a.code, kbArticle.code); kbArticle = a;
    }, 'REAL_API_MYSQL');
  });
  await flow('flow7', 'RAG có nguồn: retrieval thật, Gemini MOCK', async () => {
    const p = pages.EMPLOYEE;
    await step('Gửi câu hỏi, loading và chặn lặp', 'Một request, UI disable trong khi provider chờ', async () => {
      await openRag(p); let release, entered;
      providerGate = new Promise(resolve => release = resolve);
      const seen = new Promise(resolve => entered = resolve); providerEntered = entered;
      const count = report.provider.calls;
      const pending = ask(p, 'Không kết nối được Wi-Fi thì cần kiểm tra gì trước?');
      try {
        await Promise.race([seen, delay(60000).then(() => { throw new Error('PROVIDER_NOT_REACHED'); })]);
        await rag(p).getByRole('status').waitFor();
        assert.equal(await rag(p).locator('button[type=submit]').isDisabled(), true);
        assert.equal(await p.getByLabel('Câu hỏi của bạn').isDisabled(), true);
        await rag(p).locator('form').dispatchEvent('submit');
        assert.equal(report.provider.calls, count + 1);
      } finally { release(); providerGate = null; providerEntered = null; }
      const data = await pending; assert.equal(data.answered, true); assert.ok(data.sources.length);
      assert.ok(data.sources.every(s => before.knowledge_articles.some(a => a.code === s.code && a.status === 'PUBLISHED')));
      assert.deepEqual(Object.keys(data).sort(), ['answer', 'answered', 'sources']);
      assert.deepEqual(await rag(p).locator('.rag-sources li').allTextContents(), data.sources.map(s => s.code + ' — ' + s.title));
      assert.equal(await rag(p).locator('.rag-answer').textContent(), data.answer);
      await screenshot(p, '06-rag-answer-mock');
      return { mode: 'MOCK_PROVIDER_REAL_RETRIEVAL_CONTEXT_VALIDATOR', sources: data.sources.map(s => s.code) };
    }, 'MOCK_PROVIDER_REAL_RETRIEVAL');
    await step('Không tự tạo Ticket / không gọi Google từ browser', 'Số Ticket không đổi trong FLOW 7, không lộ trace/raw output', async () => {
      const [rows] = await pool.query('SELECT id FROM tickets');
      assert.equal(rows.length, before.tickets.length + temporary.tickets.length);
      assert.ok(!errors.includes('DIRECT_PROVIDER_REQUEST'));
    }, 'REAL_DB_OBSERVATION');
  });
  await flow('flow8', 'RAG ngoài KB → Ticket chủ động', async () => {
    const p = pages.EMPLOYEE;
    await step('Threshold fallback thật', 'answered=false, sources=[], provider không được gọi', async () => {
      const calls = report.provider.calls, posts = requests.filter(r => r.path === '/tickets' && r.method === 'POST').length;
      await openRag(p); const data = await ask(p, 'Nhân viên mới có bao nhiêu ngày nghỉ phép năm?');
      assert.equal(data.answered, false); assert.deepEqual(data.sources, []); assert.equal(report.provider.calls, calls);
      assert.equal(requests.filter(r => r.path === '/tickets' && r.method === 'POST').length, posts);
      await screenshot(p, '07-rag-fallback');
    }, 'REAL_RETRIEVAL_NO_PROVIDER');
    await step('Nút chuyển chỉ điều hướng, user quyết định gửi', 'Mở mục Ticket, chọn form; không POST tự động', async () => {
      const posts = requests.filter(r => r.path === '/tickets' && r.method === 'POST').length;
      await rag(p).getByRole('button', { name: 'Tạo yêu cầu hỗ trợ', exact: true }).click();
      await p.getByRole('heading', { name: 'Yêu cầu hỗ trợ của tôi', exact: true }).waitFor();
      await p.getByRole('button', { name: 'Tạo yêu cầu', exact: true }).click();
      await p.getByLabel('Mô tả sự cố').waitFor();
      assert.equal(requests.filter(r => r.path === '/tickets' && r.method === 'POST').length, posts);
      await screenshot(p, '08-fallback-ticket-form');
      await p.getByRole('button', { name: 'Hủy', exact: true }).click();
      return { autoSubmit: false, userDecision: 'Hủy tạo, không thêm Ticket' };
    });
  });

  await flow('flow9', 'ADMIN', async () => {
    const p = pages.ADMIN;
    await step('ADMIN profile, Ticket và KB', 'Quyền theo code, không có POST tạo Ticket', async () => {
      const me = await apiCall('/auth/me', 200, sessions.ADMIN); assert.equal(me.user.role, 'ADMIN');
      await openTicket(p); await ticketState(p, 'Đã đóng');
      assert.equal(await p.getByRole('button', { name: 'Tạo yêu cầu', exact: true }).count(), 0);
      await openKb(p); await kbDetail(p);
      assert.equal(await article(p).getByRole('button', { name: 'Sửa bài', exact: true }).count(), 1);
      assert.equal(await article(p).getByRole('button', { name: 'Xuất bản', exact: true }).count(), 1);
      await apiCall('/users', 200, sessions.ADMIN);
      return { users: 'Backend API available; dedicated frontend management screen not implemented.' };
    });
    await step('ADMIN xử lý Ticket IT đang nhận qua API', 'ADMIN được đổi priority và workflow, IT khác vẫn bị chặn', async () => {
      const temp = (await apiCall('/tickets', 201, sessions.EMPLOYEE, 'POST', { title: marker + ' ADMIN quyền xử lý', description: 'Dữ liệu test tạm.' })).ticket;
      temporary.tickets.push({ id: temp.id, code: temp.code, title: temp.title, created_by: temp.created_by });
      report.temporaryData.tickets.push({ id: temp.id, code: temp.code });
      await apiCall('/tickets/' + temp.id + '/accept', 200, sessions.IT, 'PATCH', {});
      await apiCall('/tickets/' + temp.id + '/status', 403, sessions.OTHER_IT, 'PATCH', { status: 'IN_PROGRESS' });
      await apiCall('/tickets/' + temp.id + '/priority', 200, sessions.ADMIN, 'PATCH', { priority: 'HIGH' });
      await apiCall('/tickets/' + temp.id + '/status', 200, sessions.ADMIN, 'PATCH', { status: 'IN_PROGRESS' });
      const t = (await apiCall('/tickets/' + temp.id, 200, sessions.ADMIN)).ticket;
      assert.equal(t.history.at(-1).actor_id, sessions.ADMIN.user.id); assert.equal(t.assigned_to, sessions.IT.user.id);
    }, 'REAL_API_MYSQL');
    await step('ADMIN RAG', 'Có answer MOCK và fallback thật; không có nút tạo Ticket', async () => {
      await openRag(p); assert.equal((await ask(p, 'Không kết nối được Wi-Fi thì cần kiểm tra gì trước?')).answered, true);
      assert.equal((await ask(p, 'Nhân viên mới có bao nhiêu ngày nghỉ phép năm?')).answered, false);
      assert.equal(await rag(p).getByRole('button', { name: 'Tạo yêu cầu hỗ trợ', exact: true }).count(), 0);
    }, 'MOCK_PROVIDER_REAL_RETRIEVAL');
  });
  await flow('flow10', 'Session / reload / error', async () => {
    const p = pages.EMPLOYEE;
    await step('Reload, logout và protected UI', 'Giữ phiên qua reload; logout xóa token và UI bảo vệ', async () => {
      await p.reload(); await p.getByRole('heading', { name: /^Xin chào,/ }).waitFor();
      await p.getByRole('button', { name: 'Đăng xuất', exact: true }).click(); await p.reload();
      await p.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
      assert.equal(await p.evaluate(() => sessionStorage.getItem('it_support_token')), null);
      assert.equal(await p.getByRole('navigation').count(), 0);
      await login('EMPLOYEE');
    });
    await step('Token sai/hết hạn, backend 401 thật', 'Xóa token và trở về login', async () => {
      const jwt = require('jsonwebtoken'), { getJwtSecret } = require('../src/config/jwt');
      for (const token of ['invalid', jwt.sign({}, getJwtSecret(), { subject: String(sessions.EMPLOYEE.user.id), expiresIn: -1 })]) {
        await p.evaluate(value => sessionStorage.setItem('it_support_token', value), token); await p.reload();
        await p.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
        assert.equal(await p.evaluate(() => sessionStorage.getItem('it_support_token')), null); await login('EMPLOYEE');
      }
    });
    await step('INACTIVE trên user tạm', 'Login và token cũ bị 401, không đổi user gốc', async () => {
      const u = sessions.OTHER_EMPLOYEE;
      await apiCall('/users/' + u.user.id + '/status', 200, sessions.ADMIN, 'PATCH', { status: 'INACTIVE' });
      try {
        await apiCall('/auth/me', 401, u);
        await apiCall('/auth/login', 401, null, 'POST', { email: u.user.email, password: process.env.SEED_USER_PASSWORD });
      } finally { await apiCall('/users/' + u.user.id + '/status', 200, sessions.ADMIN, 'PATCH', { status: 'ACTIVE' }); }
    }, 'REAL_API_MYSQL_TEMP_USER');
    await step('UI lỗi 403/404/500, empty và loading', 'Hiển thị lỗi an toàn, không crash', async () => {
      await openKb(p);
      for (const status of [403, 404, 500]) {
        const handler = route => route.fulfill({ status, json: { success: false, message: status === 500 ? 'RAW_MOCK_DIAGNOSTIC' : 'Lỗi kiểm thử HTTP ' + status } });
        await p.route(api + '/knowledge', handler);
        try {
          await p.getByRole('button', { name: 'Làm mới kho kiến thức', exact: true }).click();
          await p.locator('.knowledge').getByRole('alert').waitFor();
          assert.ok(!(await p.locator('.knowledge').innerText()).includes('RAW_MOCK_DIAGNOSTIC'));
        } finally { await p.unroute(api + '/knowledge', handler); }
      }
      const empty = route => route.fulfill({ json: { success: true, articles: [] } });
      await p.route(api + '/knowledge', empty);
      await p.getByRole('button', { name: 'Làm mới kho kiến thức', exact: true }).click();
      await p.getByText('Chưa có bài viết phù hợp.', { exact: true }).waitFor(); await p.unroute(api + '/knowledge', empty);
      let release; const gate = new Promise(resolve => release = resolve);
      const slow = async route => { await gate; await route.continue(); };
      await p.route(api + '/knowledge', slow);
      try {
        await p.getByRole('button', { name: 'Làm mới kho kiến thức', exact: true }).click();
        await p.getByText('Đang tải...', { exact: true }).waitFor();
      } finally { release(); }
      await p.locator('.kb-list').waitFor(); await p.unroute(api + '/knowledge', slow);
    }, 'MOCK_NETWORK_ERROR_EMPTY_DELAY');
  });
}
async function reviewP2() {
  const p = pages.EMPLOYEE;
  for (const [key, ids] of [['P2-01', ['B01', 'C03']], ['P2-02', ['A03', 'C01']]]) {
    const item = report.previous_p2_review[key] = { status: 'NOT RUN', mode: 'REPLAY_HISTORICAL_PROVIDER_OUTPUT_REAL_RETRIEVAL', observations: [], severity: 'P2', proposed_stage: '6.3' };
    try {
      await openRag(p);
      for (const id of ids) {
        const q = readJson('docs/stage5-4-results.json').questions.find(q => q.id === id);
        providerMode = id;
        const data = await ask(p, q.question, key === 'P2-02' ? 502 : 200);
        if (key === 'P2-01') {
          assert.equal(data.answered, true); assert.equal(data.answer, q.response.answer);
          item.observations.push({ id, reproduced: true, actual: 'Output lịch sử chưa đạt grounding/clarification vẫn đi qua validator và hiển thị UI.', expected: 'Chỉ khẳng định có căn cứ, xử lý câu mơ hồ phù hợp.' });
        } else {
          assert.equal(data.code, 'GEMINI_INVALID_EVIDENCE');
          assert.equal(await rag(p).locator('.rag-result').count(), 0);
          assert.ok((await rag(p).getByRole('alert').innerText()).includes('Chưa xác minh'));
          item.observations.push({ id, reproduced: true, http: 502, actual: 'Quote quá dài bị từ chối, UI hiển thị lỗi an toàn, không answer giả.' });
        }
      }
      item.status = 'REPRODUCED'; item.e2eImpact = key === 'P2-01' ? 'Chất lượng nội dung, không crash/navigation/RBAC.' : 'Có thể không nhận được answer; UI xử lý 502 đúng.';
      item.demoImpact = 'Cần trình bày giới hạn; không nâng P1 vì chưa có bằng chứng lỗi mới làm hỏng workflow.';
    } catch (error) { item.status = 'PARTIAL'; item.errorType = error.name; }
    finally { providerMode = 'NORMAL'; }
  }
  report.previous_p2_review['P2-03'] = {
    status: 'VERIFIED', mode: 'CURRENT_RUN_AND_STATIC_REVIEW', severity: 'P2', proposed_stage: '6.3',
    e2eImpact: 'Runner mới được lưu Git; vẫn phụ thuộc MySQL/demo/Edge/Playwright thư mục tạm.',
    demoImpact: 'Môi trường hiện tại chạy được; máy mới cần chuẩn bị dependency/cache. Không dùng --reuse-browser.',
    remaining: 'Chưa thử trên máy sạch hoặc CI; không kết luận đã sửa toàn bộ vấn đề tái lập.'
  };
  const model = require('../src/models/userModel'), controller = require('../src/controllers/userController');
  const saved = { updateRole: model.updateRole, updateStatus: model.updateStatus };
  const observed = [];
  try {
    // Chỉ mô phỏng model trong bộ nhớ; không gửi request thay đổi ADMIN gốc.
    const sole = { id: 2147483646, role: 'ADMIN', status: 'ACTIVE' };
    model.updateRole = async (id, role) => ({ ...sole, id, role });
    model.updateStatus = async (id, status) => ({ ...sole, id, status });
    for (const [handler, body] of [[controller.changeRole, { role: 'EMPLOYEE' }], [controller.changeStatus, { status: 'INACTIVE' }]]) {
      let status = 200, value; const res = { status(n) { status = n; return this; }, json(v) { value = v; } };
      await handler({ params: { id: String(sole.id) }, body, user: sole }, res);
      assert.equal(status, 200); assert.equal(value.success, true); observed.push(body);
    }
    report.previous_p2_review['P2-04'] = {
      status: 'REPRODUCED_CONTROLLER_MODEL_MOCK', severity: 'P2', proposed_stage: '6.3',
      mode: 'ISOLATED_CONTROLLER_NO_DB_WRITE', observed,
      e2eImpact: 'Controller không kiểm ADMIN cuối; không thử khóa ADMIN gốc.',
      demoImpact: 'Không tác động luồng demo thông thường; cần chốt chính sách bảo vệ tài khoản cuối.',
      limitation: 'Không phải thử nghiệm E2E mất quyền ADMIN thật.'
    };
  } finally { Object.assign(model, saved); }
  const it = pages.IT;
  const unicode = report.previous_p2_review['P2-05'] = { status: 'NOT RUN', severity: 'P2', proposed_stage: '6.3' };
  try {
    await openKb(it); await it.getByRole('button', { name: '+ Tạo bài', exact: true }).click();
    const title = marker + ' ' + '😀'.repeat(130), input = it.getByLabel('Tiêu đề', { exact: true });
    await input.click(); await it.keyboard.insertText(title);
    const actual = await input.inputValue();
    assert.ok(actual.length <= 255); assert.ok(actual !== title); assert.ok(Array.from(title).length <= 255);
    const created = (await apiCall('/knowledge', 201, sessions.IT, 'POST', { title, content: marker + ' Unicode test.' })).article;
    temporary.articles.push({ id: created.id, code: created.code, created_by: created.created_by });
    report.temporaryData.articles.push({ id: created.id, code: created.code });
    assert.equal(created.title, title);
    Object.assign(unicode, { status: 'REPRODUCED', mode: 'REAL_BROWSER_KEYBOARD_AND_REAL_API', expected: 'Giới hạn title UI/API thống nhất.', actual: 'UI chặn theo UTF-16, API nhận đủ title theo code point.', uiUtf16: actual.length, apiUtf16: title.length, apiCodePoints: Array.from(title).length, e2eImpact: 'Title ngoài BMP bị giới hạn sớm trên UI.', demoImpact: 'Chữ Việt BMP thông thường không bị khác biệt này.' });
    await it.getByRole('button', { name: 'Hủy', exact: true }).click();
  } catch (error) { unicode.status = 'PARTIAL'; unicode.errorType = error.name; }
}
async function responsive() {
  const mobile = await newPage();
  for (const width of [1280, 390]) {
    await mobile.setViewportSize({ width, height: 844 });
    await mobile.goto('http://127.0.0.1:5173');
    await mobile.evaluate(() => sessionStorage.clear()); await mobile.reload();
    async function checkView(screen, target) {
      const result = { screen, width, status: 'NOT RUN' };
      report.responsive.checks.push(result);
      try {
        await target.waitFor(); const box = await target.boundingBox();
        const scroll = await mobile.evaluate(() => ({ page: document.documentElement.scrollWidth, width: innerWidth }));
        assert.ok(scroll.page <= scroll.width + 1);
        assert.ok(box && box.width > 100 && box.x >= 0 && box.x + box.width <= width + 1);
        if (screen !== 'Login') { assert.equal(await mobile.getByRole('navigation').getByRole('button').count(), 3); }
        result.status = 'PASS'; result.pageWidth = scroll.page;
      } catch (error) { result.status = 'FAIL'; result.severity = 'P2'; result.actual = error.name; }
    }
    await checkView('Login', mobile.getByLabel('Email', { exact: true }));
    await login('EMPLOYEE', mobile);
    await checkView('Ticket', mobile.locator('.tickets'));
    await openKb(mobile); await checkView('Knowledge Base', mobile.locator('.knowledge'));
    await openRag(mobile);
    await ask(mobile, 'Không kết nối được Wi-Fi thì cần kiểm tra gì trước?');
    await checkView('RAG answer/sources', mobile.locator('.rag-assistant'));
    if (width === 390) await screenshot(mobile, '09-mobile-rag-mock');
  }
  await mobile.close();
}
async function cleanup() {
  if (!before) return;
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    for (const t of temporary.tickets) {
      assert.ok(!before.tickets.some(x => x.id === t.id));
      const [[row]] = await c.execute('SELECT id,code,title,created_by FROM tickets WHERE id=? FOR UPDATE', [t.id]);
      assert.deepEqual(row, t);
      await c.execute('DELETE FROM ticket_history WHERE ticket_id=?', [t.id]);
      const [deleted] = await c.execute('DELETE FROM tickets WHERE id=? AND code=? AND created_by=?', [t.id, t.code, t.created_by]);
      assert.equal(deleted.affectedRows, 1);
    }
    for (const a of temporary.articles) {
      assert.ok(!before.knowledge_articles.some(x => x.id === a.id));
      const [[row]] = await c.execute('SELECT id,code,created_by,title,content FROM knowledge_articles WHERE id=? FOR UPDATE', [a.id]);
      assert.equal(row.code, a.code); assert.equal(row.created_by, a.created_by);
      assert.ok(row.title.startsWith(marker) && row.content.startsWith(marker));
      const [deleted] = await c.execute('DELETE FROM knowledge_articles WHERE id=? AND code=? AND created_by=?', [a.id, a.code, a.created_by]);
      assert.equal(deleted.affectedRows, 1);
    }
    for (const u of temporary.users) {
      assert.ok(!before.users.some(x => x.id === u.id));
      const [[row]] = await c.execute('SELECT email,name FROM users WHERE id=? FOR UPDATE', [u.id]);
      assert.equal(row.email, u.email); assert.ok(row.name.startsWith(marker));
      const [deleted] = await c.execute('DELETE FROM users WHERE id=? AND email=?', [u.id, u.email]);
      assert.equal(deleted.affectedRows, 1);
    }
    await c.commit();
    temporary.tickets.length = temporary.articles.length = temporary.users.length = 0;
    const after = await snapshot(pool); assert.deepEqual(after, before);
    report.database.afterE2E = { counts: counts(after), published: after.knowledge_articles.filter(a => a.status === 'PUBLISHED').length };
    report.cleanup = { status: 'PASS', fullOriginalRowsPreserved: true, remainingTemporaryRows: 0 };
  } catch (error) {
    await c.rollback();
    report.cleanup = { status: 'FAIL', errorType: error.name, remainingIds: { tickets: temporary.tickets.map(x => x.id), articles: temporary.articles.map(x => x.id), users: temporary.users.map(x => x.id) } };
    throw new Error('CLEANUP_FAILED_STOP');
  } finally { c.release(); }
}

async function authRegression() {
  const suite = { suite: 'Auth/JWT/RBAC/Users: fixture tạm GĐ6.2', mode: 'REAL_API_MYSQL_NO_ORIGINAL_USER_MUTATION', tests: [] };
  report.regression.suites.push(suite);
  const check = async (name, action) => {
    const t = { name, status: 'NOT RUN' }; suite.tests.push(t);
    try { await action(); t.status = 'PASS'; } catch (error) { t.status = 'FAIL'; t.errorType = error.name; throw error; }
  };
  let user;
  for (const role of ['EMPLOYEE', 'IT', 'ADMIN']) await check('Login /me ' + role, async () => {
    sessions[role] = await apiCall('/auth/login', 200, null, 'POST', { email: role.toLowerCase() + '@test.local', password: process.env.SEED_USER_PASSWORD });
    assert.equal((await apiCall('/auth/me', 200, sessions[role])).user.role, role);
  });
  await check('Bcrypt cost 12 cho tài khoản gốc', async () => {
    const bcrypt = require('bcrypt');
    for (const u of before.users) { assert.equal(bcrypt.getRounds(u.password), 12); assert.ok(await bcrypt.compare(process.env.SEED_USER_PASSWORD, u.password)); }
  });
  await check('Sai mật khẩu / email không tồn tại', async () => {
    await apiCall('/auth/login', 401, null, 'POST', { email: 'employee@test.local', password: randomUUID() });
    await apiCall('/auth/login', 401, null, 'POST', { email: 'absent-' + randomUUID() + '@test.local', password: process.env.SEED_USER_PASSWORD });
  });
  await check('Thiếu/sai/hết hạn/sai signature JWT', async () => {
    const jwt = require('jsonwebtoken'), { getJwtSecret } = require('../src/config/jwt');
    await apiCall('/auth/me', 401);
    for (const token of ['invalid', jwt.sign({}, getJwtSecret(), { subject: String(sessions.EMPLOYEE.user.id), expiresIn: -1 }), jwt.sign({}, randomUUID(), { subject: String(sessions.EMPLOYEE.user.id), expiresIn: 60 })]) await apiCall('/auth/me', 401, { token });
  });
  await check('Ma trận RBAC thật', async () => {
    for (const role of ['EMPLOYEE', 'IT', 'ADMIN']) {
      await apiCall('/test/employee', 200, sessions[role]);
      await apiCall('/test/it', role === 'EMPLOYEE' ? 403 : 200, sessions[role]);
      await apiCall('/test/admin', role === 'ADMIN' ? 200 : 403, sessions[role]);
      await apiCall('/users', role === 'ADMIN' ? 200 : 403, sessions[role]);
    }
  });
  await check('ADMIN tạo user tạm, response không password, bcrypt', async () => {
    user = await createUser('EMPLOYEE');
    const [[row]] = await pool.execute('SELECT password FROM users WHERE id=?', [user.user.id]);
    assert.equal(require('bcrypt').getRounds(row.password), 12);
    assert.ok(await require('bcrypt').compare(process.env.SEED_USER_PASSWORD, row.password));
  });
  await check('Email trùng bị 409', () => apiCall('/users', 409, sessions.ADMIN, 'POST', { name: marker, email: user.user.email.toUpperCase(), password: process.env.SEED_USER_PASSWORD }));
  await check('INACTIVE chặn login/token trên user tạm', async () => {
    await apiCall('/users/' + user.user.id + '/status', 200, sessions.ADMIN, 'PATCH', { status: 'INACTIVE' });
    await apiCall('/auth/me', 401, user);
    await apiCall('/auth/login', 401, null, 'POST', { email: user.user.email, password: process.env.SEED_USER_PASSWORD });
    await apiCall('/users/' + user.user.id + '/status', 200, sessions.ADMIN, 'PATCH', { status: 'ACTIVE' });
    await apiCall('/auth/me', 200, user);
  });
  await check('Token cũ dùng role hiện tại DB', async () => {
    await apiCall('/test/it', 403, user);
    await apiCall('/users/' + user.user.id + '/role', 200, sessions.ADMIN, 'PATCH', { role: 'IT' });
    await apiCall('/test/it', 200, user);
    await apiCall('/users/' + user.user.id + '/role', 200, sessions.ADMIN, 'PATCH', { role: 'EMPLOYEE' });
    await apiCall('/test/it', 403, user);
  });
  await check('Non-admin không quản lý user', async () => {
    for (const s of [sessions.EMPLOYEE, sessions.IT]) {
      await apiCall('/users', 403, s, 'POST', {});
      await apiCall('/users/' + user.user.id + '/role', 403, s, 'PATCH', { role: 'ADMIN' });
      await apiCall('/users/' + user.user.id + '/status', 403, s, 'PATCH', { status: 'INACTIVE' });
    }
  });
  await check('Validation user và ID', async () => {
    for (const patch of [{ name: '' }, { email: 'invalid' }, { password: 'short' }, { password: 'a'.repeat(73) }, { role: 'OWNER' }, { status: 'DISABLED' }])
      await apiCall('/users', 400, sessions.ADMIN, 'POST', { name: marker, email: 'validation@test.local', password: process.env.SEED_USER_PASSWORD, ...patch });
    await apiCall('/users/invalid/role', 400, sessions.ADMIN, 'PATCH', { role: 'IT' });
    await apiCall('/users/2147483647/status', 404, sessions.ADMIN, 'PATCH', { status: 'ACTIVE' });
  });
  await check('Health/DB health', async () => { await apiCall('/health', 200); await apiCall('/health/db', 200); });
  await cleanup();
  console.log('Regression Auth/Users: ' + suite.tests.length + ' PASS');
}
async function cleanLegacyTickets(saved, rows) {
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    for (const t of rows) {
      assert.ok(!saved.tickets.some(x => x.id === t.id));
      assert.ok(['Demo: Máy tính không kết nối Wi-Fi', 'Demo: Máy in cần kiểm tra thêm', 'Demo giao diện: Không kết nối được Wi-Fi văn phòng'].includes(t.title));
      assert.equal(t.created_by, before.users.find(u => u.email === 'employee@test.local').id);
      const [[current]] = await c.execute('SELECT * FROM tickets WHERE id=? FOR UPDATE', [t.id]); assert.deepEqual(current, t);
      await c.execute('DELETE FROM ticket_history WHERE ticket_id=?', [t.id]);
      const [result] = await c.execute('DELETE FROM tickets WHERE id=? AND code=? AND created_by=?', [t.id, t.code, t.created_by]);
      assert.equal(result.affectedRows, 1);
    }
    await c.commit();
  } catch (error) { await c.rollback(); throw error; } finally { c.release(); }
}
async function runRegression() {
  await authRegression();
  for (const [label, script, exportName] of [
    ['RAG GĐ5.2 logic', 'stage5-2-logic.cjs', 'runLogic'],
    ['RAG GĐ5.3 logic', 'stage5-3-logic.cjs', 'runLogic'],
    ['RAG GĐ5.4 logic', 'stage5-4-logic.cjs', 'runLogic'],
    ['RAG GĐ5.4 API mock', 'stage5-4-api.cjs', 'runApi']
  ]) {
    const tests = await require('./' + script)[exportName]();
    assert.ok(tests.every(t => t.status === 'PASS'));
    report.regression.suites.push({ suite: label, tests }); console.log('Regression ' + label + ': ' + tests.length + ' PASS');
  }
  for (const [script, target, args] of [
    ['stage3-api.cjs', 'docs/stage3-api-results.json', []],
    ['stage4-2-api.cjs', 'docs/stage4-2-api-results.json', []],
    ['stage2-browser.cjs', 'docs/stage2-browser-results.json', []],
    ['stage3-browser.cjs', 'docs/stage3-browser-results.json', []],
    ['stage4-4-browser.cjs', 'docs/stage4-4-browser-results.json', []],
    ['stage5-5-browser.cjs', 'backend/.cache/rag/stage5-5-browser.json', ['--mock-only']]
  ]) {
    const saved = await snapshot(pool); let failed = false;
    try {
      execFileSync(process.execPath, [path.join(__dirname, script), ...args], { cwd: path.join(root, 'backend'), stdio: 'pipe', windowsHide: true, timeout: 240000, maxBuffer: 8e6 });
    } catch { failed = true; }
    const result = readJson(target), tests = result.results || result.tests;
    report.regression.suites.push({ suite: script, status: failed ? 'FAIL' : 'PASS', tests });
    if (script === 'stage5-5-browser.cjs') assert.equal(result.integration.realGeminiCalls, 0);
    if (script === 'stage3-api.cjs' || script === 'stage3-browser.cjs') {
      const after = await snapshot(pool);
      const rows = after.tickets.filter(t => !saved.tickets.some(old => old.id === t.id));
      await cleanLegacyTickets(saved, rows);
    }
    assert.deepEqual(await snapshot(pool), saved);
    if (originals.has(target)) fs.writeFileSync(path.join(root, target), originals.get(target));
    assert.ok(!failed && tests.every(t => t.status === 'PASS'), 'REGRESSION_FAILED');
    console.log('Regression ' + script + ': ' + tests.length + ' PASS');
  }
  report.regression.status = 'PASS';
}
async function stopBrowser() {
  if (browser) { await browser.close(); browser = null; }
  if (frontend && frontend.exitCode === null && frontend.signalCode === null) { const stopped = new Promise(resolve => frontend.once('exit', resolve)); frontend.kill(); await stopped; }
  frontend = null;
}
async function main() {
  assert.notEqual(process.env.NODE_ENV, 'production'); assert.ok(['127.0.0.1', 'localhost', '::1'].includes(process.env.DB_HOST));
  assert.equal(report.git.branch, 'main');
  const [[db]] = await pool.query('SELECT DATABASE() AS name'); assert.equal(db.name, 'it_support_rag');
  before = await snapshot(pool);
  report.database.before = { counts: counts(before), published: before.knowledge_articles.filter(a => a.status === 'PUBLISHED').length };
  assert.deepEqual(counts(before), { users: 3, tickets: 3, ticket_history: 17, knowledge_articles: 8 }, 'BASELINE_DIFFERS_STOP');
  assert.equal(report.database.before.published, 8);
  for (const file of git(['ls-files', 'docs', 'backend/src', 'frontend/src', 'database']).split(/\r?\n/)) {
    // Báo cáo/ảnh GĐ6.2 thuộc lượt chạy hiện tại, không phải artifact lịch sử cần khôi phục.
    if (file === 'docs/stage6-2-results.json' || file.startsWith('docs/evidence/stage6-2/')) continue;
    originals.set(file, fs.readFileSync(path.join(root, file)));
  }
  const cache = 'backend/.cache/rag/stage5-5-browser.json';
  if (fs.existsSync(path.join(root, cache))) originals.set(cache, fs.readFileSync(path.join(root, cache)));
  fs.mkdirSync(evidenceDir, { recursive: true });
  report.environment.sourceFiles = ['backend/src/app.js', 'backend/src/rag/generationService.js', 'backend/src/rag/generationConfig.js', 'frontend/src/App.jsx'].map(file => ({ file, sha256: sha(fs.readFileSync(path.join(root, file))) }));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  api = 'http://127.0.0.1:' + server.address().port + '/api';
  frontend = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
    cwd: path.join(root, 'frontend'), env: { ...process.env, VITE_API_URL: api }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  });
  let startup = ''; frontend.stdout.on('data', d => startup += d); frontend.stderr.on('data', d => startup += d);
  for (let i = 0; i < 150 && !startup.includes('http://127.0.0.1:5173'); i++) { assert.equal(frontend.exitCode, null); await delay(100); }
  assert.ok(startup.includes('http://127.0.0.1:5173'), 'FRONTEND_START_FAILED');
  browser = await chromium.launch({ channel: 'msedge', headless: true }); report.environment.browserVersion = browser.version();
  for (const role of ['EMPLOYEE', 'IT', 'ADMIN']) pages[role] = await newPage();
  await runFlows();
  ensureNoSecrets(report); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  await reviewP2();
  await responsive();
  assert.deepEqual(errors, []);
  await stopBrowser();
  await cleanup();
  await runRegression();
  ensureNoSecrets(report); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  execFileSync(process.execPath, [path.join(root, 'frontend/node_modules/vite/bin/vite.js'), 'build'], { cwd: path.join(root, 'frontend'), stdio: 'pipe', windowsHide: true, timeout: 90000 });
  report.frontend_build = { status: 'PASS', command: 'node node_modules/vite/bin/vite.js build', directory: 'frontend' };
  const after = await snapshot(pool); assert.deepEqual(after, before);
  report.database.after = { counts: counts(after), published: after.knowledge_articles.filter(a => a.status === 'PUBLISHED').length, fullOriginalRowsPreserved: true };
  report.security = { envTracked: 'NOT FOUND', secretValuesInFiles: 'NOT VERIFIED', screenshots: 'TEXT_CHECKED_VISUAL_REVIEW_PENDING', originalSourceChanged: 'NOT FOUND', realGeminiRequests: 0 };
  assert.equal(git(['diff', '--name-only', 'HEAD', '--', 'backend/src', 'frontend/src', 'database', 'README.md']), '');
  report.completed = true;
}
main().catch(error => {
  report.infrastructureError = { type: error.name, step: activeStep || 'setup', code: ['CLEANUP_FAILED_STOP', 'BASELINE_DIFFERS_STOP', 'REGRESSION_FAILED'].includes(error.message) ? error.message : 'EXECUTION_CHECK_FAILED' };
  console.error('GĐ6.2 dừng kiểm tra: ' + report.infrastructureError.code);
  process.exitCode = 1;
}).finally(async () => {
  await stopBrowser();
  try { if (temporary.users.length || temporary.tickets.length || temporary.articles.length) await cleanup(); }
  catch { report.completed = false; process.exitCode = 1; }
  report.runtimeCleanup = {};
  if (server) {
    const closed = new Promise(resolve => server.close(resolve));
    server.closeAllConnections(); await closed;
    report.runtimeCleanup.httpServer = 'CLOSED';
  }
  // Giới hạn thời gian đóng tài nguyên native của riêng tiến trình test.
  // Ghi rõ timeout; chỉ kết thúc process test sau khi report/DB/artifact đã kiểm tra.
  let disposalTimer;
  const disposed = await Promise.race([
    Promise.all(services.map(service => service.dispose())).then(() => true),
    new Promise(resolve => { disposalTimer = setTimeout(() => resolve(false), 10000); })
  ]);
  clearTimeout(disposalTimer);
  report.runtimeCleanup.modelDispose = disposed ? 'DISPOSED' : 'TIMEOUT';
  for (const [file, bytes] of originals) if (!fs.readFileSync(path.join(root, file)).equals(bytes)) {
    // Chỉ khôi phục artifact do suite cũ ghi; source khác phải dừng, không ghi đè.
    if (/\.(json|png)$/.test(file) && (file.startsWith('docs/') || file.startsWith('backend/.cache/'))) fs.writeFileSync(path.join(root, file), bytes);
    else { report.completed = false; report.infrastructureError = { code: 'UNEXPECTED_SOURCE_CHANGE' }; process.exitCode = 1; }
  }
  report.priorReportsPreserved = [...originals].every(([file, bytes]) => fs.readFileSync(path.join(root, file)).equals(bytes));
  report.finishedAt = new Date().toISOString();
  report.e2eSummary = Object.fromEntries(['PASS', 'FAIL', 'PARTIAL', 'NOT RUN'].map(status => [status, Object.values(report.e2e).filter(f => f.status === status).length]));
  try { ensureNoSecrets(report); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); console.log('E2E: ' + JSON.stringify(report.e2eSummary)); }
  finally { await pool.end(); }
  if (report.runtimeCleanup?.modelDispose === 'TIMEOUT') process.exit(process.exitCode || 0);
});
