// Browser UI regression against isolated API fixtures only. No real auth/DB/model.
// Uses installed Edge/Chrome and Node's CDP WebSocket; no extra package needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createTicketFixture, runTicketChecks } from './ticket-ui-checks.mjs';
import { createKnowledgeFixture, runKnowledgeChecks } from './knowledge-ui-checks.mjs';
import { createRagFixture, runRagChecks } from './rag-ui-checks.mjs';
import { createDashboardFixture, runDashboardChecks } from './dashboard-ui-checks.mjs';
import { createUsersFixture, runUsersChecks } from './users-ui-checks.mjs';
import { createAuditFixture, runAuditChecks } from './audit-ui-checks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ticketMode = process.argv.includes('--tickets');
const knowledgeMode = process.argv.includes('--knowledge');
const ragUiMode = process.argv.includes('--rag');
const dashboardMode = process.argv.includes('--dashboard');
const usersMode = process.argv.includes('--users');
const auditMode = process.argv.includes('--audit');
const suite = auditMode ? 'UI7' : usersMode ? 'UI6' : dashboardMode ? 'UI5' : ragUiMode ? 'UI4' : knowledgeMode ? 'UI3' : ticketMode ? 'UI2' : 'UI1';
const artifacts = path.join(root, `node_modules/.cache/${suite.toLowerCase()}-check`, String(Date.now()));
const browserPath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
if (!browserPath || !fs.existsSync(path.join(root, 'dist/index.html'))) throw new Error('Build frontend and install a browser before running this check.');
fs.mkdirSync(artifacts, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const target = path.resolve(root, 'dist', '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!target.startsWith(path.join(root, 'dist') + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
  res.end(fs.readFileSync(target));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = path.join(artifacts, 'profile');
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let ws, passed = 0, failureLabel = 'browser startup', browserFailure = false;
browser.on('error', () => { browserFailure = true; });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, label, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await test()) return; await delay(80); }
  throw new Error(label);
}
let role = 'EMPLOYEE', meStatus = 200, ragMode = 'answer';
let calls = [], runtimeErrors = 0, unexpectedRequests = 0;
const quote = 'Kiểm tra Wi-Fi đã bật và chế độ máy bay đã tắt.';
const user = () => ({ id: 11, name: 'Người dùng kiểm thử', email: 'ui@example.invalid', role });
const ticketFixture = createTicketFixture(user);
const knowledgeFixture = createKnowledgeFixture(user);
const ragFixture = createRagFixture(user);
const dashboardFixture = createDashboardFixture(user);
const usersFixture = createUsersFixture(user, account => { role = account.role; meStatus = account.status === 'INACTIVE' ? 401 : 200; });
const auditFixture = createAuditFixture(user, ticketFixture, knowledgeFixture);
const ticket = { id: 101, code: 'TK-000101', title: 'Yêu cầu kiểm thử giao diện', description: 'Dữ liệu chỉ tồn tại trong bộ nhớ kiểm thử.', priority: 'LOW', status: 'NEW', created_by: 11, creator_name: 'Người dùng kiểm thử', assigned_to: null, assignee_name: null, created_at: '2026-11-02T08:00:00Z', updated_at: '2026-11-02T08:00:00Z', solution: '', history: [] };
const article = { id: 8, code: 'KB-000008', title: 'Hướng dẫn Wi-Fi kiểm thử', content: quote, status: 'PUBLISHED', creator_name: 'Bộ phận kiểm thử', updater_name: null, created_at: '2026-11-02T08:00:00Z', updated_at: '2026-11-02T08:00:00Z' };
try {
  const portFile = path.join(profile, 'DevToolsActivePort');
  await until(() => { if (browserFailure) throw new Error('Browser could not start'); return fs.existsSync(portFile); }, 'DevTools unavailable');
  const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  const pending = new Map(); let sequence = 0;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout')); }, 15000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  async function intercept({ requestId, request }) {
    const url = new URL(request.url);
    const route = url.pathname.match(/\/(auth|tickets|knowledge|rag|users)(?:\/.*)?$/)?.[0];
    if (!route && url.origin === origin) { await send('Fetch.continueRequest', { requestId }); return; }
    const headers = [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: origin }, { name: 'Access-Control-Allow-Headers', value: 'authorization,content-type' }, { name: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,PATCH,OPTIONS' }];
    let status = 200, body = {};
    if (request.method === 'OPTIONS') status = 204;
    else {
      calls.push({ route, method: request.method });
      if (route === '/auth/login') body = { token: 'ui-fixture-session', user: user() };
      else if (route === '/auth/me') {
        status = meStatus; body = status === 200 ? { user: user() } : { message: 'Phiên kiểm thử không khả dụng.' };
        if (usersMode && usersFixture.authWait) { usersFixture.authStarts++; await delay(usersFixture.authWait); }
      }
      else if (auditMode && /^\/(tickets|knowledge)(?:\/|$)/.test(route || '')) ({ status, body } = await auditFixture.handle(route, request));
      else if (usersMode && /^\/users(?:\/|$)/.test(route || '')) {
        const reply = await usersFixture.handle(route, request);
        if (reply.networkError) { await send('Fetch.failRequest', { requestId, errorReason: 'ConnectionFailed' }); return; }
        ({ status, body } = reply);
      }
      else if (dashboardMode && ['/tickets', '/knowledge', '/users'].includes(route)) {
        const reply = await dashboardFixture.handle(route, request);
        if (reply.hold) return;
        ({ status, body } = reply);
      }
      else if (route === '/users' && request.method === 'GET' && role === 'ADMIN') body = { success: true, users: [{ ...user(), status: 'ACTIVE' }] };
      else if ((ticketMode || ragUiMode) && /^\/tickets(?:\/|$)/.test(route || '')) ({ status, body } = await ticketFixture.handle(route, request));
      else if (ragUiMode && /^\/(rag|knowledge)(?:\/|$)/.test(route || '')) {
        const reply = await ragFixture.handle(route, request);
        if (reply.hold) return; // Deliberately paused mock request, aborted by the frontend timeout/unmount.
        if (reply.networkError) { await send('Fetch.failRequest', { requestId, errorReason: 'ConnectionFailed' }); return; }
        ({ status, body } = reply);
      }
      else if (knowledgeMode && /^\/knowledge(?:\/|$)/.test(route || '')) ({ status, body } = await knowledgeFixture.handle(route, request));
      else if (route === '/tickets' && request.method === 'GET') body = { tickets: [ticket] };
      else if (route === '/tickets' && request.method === 'POST') body = { ticket };
      else if (/^\/tickets\/\d+$/.test(route || '')) body = { ticket };
      else if (/^\/tickets\/\d+\/(accept|priority|status)$/.test(route || '')) {
        if (route.endsWith('/accept')) { ticket.status = 'RECEIVED'; ticket.assigned_to = user().id; }
        else Object.assign(ticket, JSON.parse(request.postData));
        body = { ticket };
      }
      else if (route === '/knowledge' && request.method === 'GET') body = { articles: [article] };
      else if (route === '/knowledge' || /^\/knowledge\/\d+(\/status)?$/.test(route || '')) body = { article };
      else if (route === '/rag/ask') {
        assert.deepEqual(Object.keys(JSON.parse(request.postData)), ['question']);
        if (ragMode === 'error') { status = 503; body = { code: 'OLLAMA_UNAVAILABLE' }; }
        else body = ragMode === 'fallback' ? { answered: false, answer: 'Kho kiến thức chưa đủ thông tin.', sources: [] } : { answered: true, answer: quote, sources: [{ code: article.code, title: article.title, score: .9 }] };
      } else { unexpectedRequests++; status = 403; body = { message: 'Request blocked by isolated test.' }; }
    }
    await send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: headers, body: Buffer.from(JSON.stringify(body)).toString('base64') });
  }
  ws.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.id) {
      const p = pending.get(data.id); if (!p) return;
      clearTimeout(p.timer); pending.delete(data.id);
      if (data.error) p.reject(new Error('CDP operation failed')); else p.resolve(data.result);
    } else if (data.method === 'Fetch.requestPaused') intercept(data.params).catch(() => { runtimeErrors++; });
    else if (data.method === 'Runtime.exceptionThrown') runtimeErrors++;
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error('Browser assertion script failed');
    return result.result.value;
  };
  const exists = selector => evaluate(`!!document.querySelector(${JSON.stringify(selector)})`);
  const waitFor = selector => until(() => exists(selector), 'Element unavailable: ' + selector);
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill = (selector, value) => evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  const nav = text => evaluate(`Array.from(document.querySelectorAll('.sidebar__nav button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
  async function check(label, run) { failureLabel = label; await run(); passed++; console.log('PASS ' + label); }
  async function screenshot(name) {
    await evaluate("Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))");
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(artifacts, name + '.png'), Buffer.from(result.data, 'base64'));
  }
  const noOverflow = async () => assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  async function login(expected = '.app-shell') {
    await waitFor('#email'); await fill('#email', 'ui@example.invalid'); await fill('#password', 'synthetic-ui-input'); await click('.login-submit'); await waitFor(expected);
    // Let the initial dashboard reads settle before other suites navigate away.
    if (expected === '.app-shell') await until(() => evaluate("!!document.querySelector('.dashboard') && !document.querySelector('.dashboard [data-source-status=\"loading\"]')"), 'Dashboard loading did not finish');
  }
  await send('Runtime.enable'); await send('Page.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 });
  await send('Page.navigate', { url: origin });
  if (auditMode) {
    await runAuditChecks({ assert, check, evaluate, waitFor, until, click, nav, login, send, noOverflow, screenshot, fixture: auditFixture, setRole: value => { role = value; } });
  } else if (usersMode) {
    await runUsersChecks({ assert, check, evaluate, waitFor, until, click, fill, nav, login, send, noOverflow, screenshot, fixture: usersFixture, setRole: value => { role = value; }, setMeStatus: value => { meStatus = value; } });
  } else if (dashboardMode) {
    await runDashboardChecks({ assert, check, evaluate, waitFor, until, click, fill, nav, login, send, noOverflow, screenshot, fixture: dashboardFixture, setRole: value => { role = value; } });
  } else if (ragUiMode) {
    await runRagChecks({ assert, check, evaluate, waitFor, until, click, fill, nav, login, send, noOverflow, screenshot, fixture: ragFixture, ticketFixture, setRole: value => { role = value; } });
  } else if (knowledgeMode) {
    await runKnowledgeChecks({ assert, check, evaluate, waitFor, until, click, fill, nav, login, send, noOverflow, screenshot, fixture: knowledgeFixture, setRole: value => { role = value; } });
  } else if (ticketMode) {
    await runTicketChecks({ assert, check, evaluate, waitFor, until, click, fill, nav, login, send, noOverflow, screenshot, fixture: ticketFixture, setRole: value => { role = value; } });
  } else {
  await check('Vietnamese login, password toggle and desktop layout', async () => {
    await waitFor('.login-page'); await noOverflow();
    assert.equal(await evaluate('document.documentElement.lang'), 'vi');
    await click('[aria-label="Hiện mật khẩu"]'); assert.equal(await evaluate("document.querySelector('#password').type"), 'text');
    await click('[aria-label="Ẩn mật khẩu"]'); await screenshot('01-login-desktop');
  });
  for (const nextRole of ['EMPLOYEE', 'IT', 'ADMIN']) {
    role = nextRole;
    await check(nextRole + ' navigation, dashboard and admin user screen access', async () => {
      const callsBefore = calls.length;
      await login(); await waitFor('.dashboard');
      assert.equal(await evaluate("document.querySelectorAll('.sidebar__nav button').length"), role === 'ADMIN' ? 5 : 4);
      assert.equal(calls.slice(callsBefore).some(c => c.route === '/users'), role === 'ADMIN');
      await noOverflow();
      if (role === 'EMPLOYEE') await screenshot('02-overview-desktop');
      if (role === 'ADMIN') { await nav('Quản lý người dùng'); await waitFor('.user-list'); assert.equal(await evaluate("document.querySelectorAll('.user-list > li').length"), 1); }
    });
    await check(nextRole + ' ticket permissions, list and detail', async () => {
      await nav('Yêu cầu hỗ trợ'); await waitFor('.tickets tbody tr');
      assert.equal(await evaluate("Array.from(document.querySelectorAll('.tickets button')).some(b=>b.textContent==='Tạo yêu cầu')"), role === 'EMPLOYEE');
      await click('.tickets .link-button'); await waitFor('.ticket-detail');
      assert.equal(await evaluate("Array.from(document.querySelectorAll('.ticket-detail button')).some(b=>b.textContent==='Tiếp nhận')"), role !== 'EMPLOYEE');
      await noOverflow();
      if (role === 'EMPLOYEE') await screenshot('03-ticket-desktop');
    });
    await check(nextRole + ' KB read and edit permissions', async () => {
      await nav('Kho kiến thức'); await waitFor('.kb-title'); await click('.kb-title'); await waitFor('.kb-content');
      assert.equal(await evaluate("Array.from(document.querySelectorAll('.knowledge button')).some(b=>b.textContent==='Sửa bài')"), role !== 'EMPLOYEE');
      await noOverflow();
    });
    await check(nextRole + ' RAG answer and sources through intercepted API', async () => {
      ragMode = 'answer'; await nav('Trợ lý AI'); await fill('#rag-question', 'Hướng dẫn kiểm tra Wi-Fi?'); await click('.rag-form button'); await waitFor('.rag-sources');
      assert.equal(await evaluate("document.querySelector('.rag-answer').textContent"), quote); await noOverflow();
      if (role === 'EMPLOYEE') await screenshot('04-rag-desktop');
    });
    if (role === 'EMPLOYEE') await check('RAG fallback and navigation to existing ticket screen', async () => {
      ragMode = 'fallback'; await click('.rag-form button');
      await waitFor('.rag-ticket-cta');
      await click('.rag-ticket-cta'); await waitFor('.ticket-form');
      assert.equal(await evaluate("document.querySelector('#ticket-description').value"), 'Hướng dẫn kiểm tra Wi-Fi?');
    });
    if (role === 'ADMIN') await check('Role downgrade removes admin menu and screen', async () => {
      await nav('Quản lý người dùng'); await waitFor('.user-list'); role = 'EMPLOYEE'; await evaluate("window.dispatchEvent(new Event('focus'))");
      await until(() => evaluate("document.querySelectorAll('.sidebar__nav button').length===4 && !!document.querySelector('.welcome-card')"), 'Role downgrade not reflected');
    });
    await check(nextRole + ' logout clears session', async () => {
      await click('[aria-label="Đăng xuất"]'); await waitFor('.login-page');
      assert.equal(await evaluate("sessionStorage.getItem('it_support_token')===null"), true);
    });
  }
  await check('Session restore and 401 logout', async () => {
    await login(); await send('Page.reload'); await waitFor('.app-shell');
    meStatus = 401; await evaluate("window.dispatchEvent(new Event('focus'))"); await waitFor('.login-page');
    assert.equal(await evaluate("sessionStorage.getItem('it_support_token')===null"), true); meStatus = 200;
  });
  await check('Failed session verification offers retry without dropping token', async () => {
    meStatus = 503; await login('.session-card .empty-state');
    assert.equal(await evaluate("sessionStorage.getItem('it_support_token')!==null"), true);
    meStatus = 200; await click('.session-card .actions button'); await waitFor('.app-shell');
  });
  await check('Mobile drawer, Escape, focus return and page layout at 390px', async () => {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 });
    await until(() => evaluate("document.querySelector('.sidebar').inert"), 'Sidebar not hidden');
    await click('[aria-label="Mở menu"]'); await waitFor('.sidebar--open');
    assert.equal(await evaluate("document.querySelector('.app-workspace').inert"), true);
    await screenshot('05-mobile-menu');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await until(() => evaluate("!document.querySelector('.sidebar--open')"), 'Escape failed');
    await until(() => evaluate("document.activeElement.getAttribute('aria-label')==='Mở menu'"), 'Focus not restored');
    await noOverflow(); await screenshot('06-overview-mobile');
    await click('[aria-label="Mở menu"]');
    await until(() => evaluate("document.activeElement.getAttribute('aria-label')==='Đóng menu'"), 'Drawer focus missing').catch(async error => {
      console.log(JSON.stringify(await evaluate("({active:document.activeElement.tagName,label:document.activeElement.getAttribute('aria-label'),open:!!document.querySelector('.sidebar--open'),inert:document.querySelector('.sidebar').inert,visibility:getComputedStyle(document.querySelector('.sidebar')).visibility,first:document.querySelector('.sidebar button')?.getAttribute('aria-label')})")));
      throw error;
    });
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', modifiers: 8, windowsVirtualKeyCode: 9 });
    assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"), 'Đăng xuất');
    await click('[aria-label="Đóng menu"]');
    for (const [label, selector] of [['Yêu cầu hỗ trợ', '.tickets tbody tr'], ['Kho kiến thức', '.kb-title'], ['Trợ lý AI', '.rag-form']]) {
      await click('[aria-label="Mở menu"]'); await nav(label); await waitFor(selector); await noOverflow();
    }
    await screenshot('07-rag-mobile');
    ragMode = 'error'; await fill('#rag-question', 'Kiểm tra lỗi giả lập'); await click('.rag-form button'); await waitFor('.rag-assistant [role="alert"]');
    await noOverflow();
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 720, mobile: true, deviceScaleFactor: 1 }); await noOverflow();
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 });
    await click('[aria-label="Mở menu"]'); await click('[aria-label="Đăng xuất"]'); await waitFor('.login-page'); await noOverflow(); await screenshot('08-login-mobile');
  });
  }
  await check('No browser exceptions or unhandled external/API requests', async () => { assert.equal(runtimeErrors, 0, 'Browser or interception errors'); assert.equal(unexpectedRequests, 0, 'Unexpected API requests'); });
  console.log(`${suite}: ${passed}/${passed} PASS; every API request intercepted; no real DB/model calls.`);
  console.log('Screenshots: ' + artifacts);
  await send('Browser.close').catch(() => {});
} catch (error) {
  console.error(suite + '_FAILED: ' + failureLabel);
  // All browser state is synthetic. Print only the test failure, never request bodies.
  console.error(String(error.message).split('\n').slice(0, 4).join('\n'));
  process.exitCode = 1;
} finally {
  ws?.close(); browser.kill(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
