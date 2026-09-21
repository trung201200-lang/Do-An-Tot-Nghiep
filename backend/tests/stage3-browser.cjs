const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { chromium } = require(path.join(os.tmpdir(), 'it-support-browser-check/node_modules/playwright'));
const app = require('../src/app');
const pool = require('../src/config/db');
const results = [];
let browser, frontend, ticket;
const server = app.listen(0, '127.0.0.1', async () => {
  const api = `http://127.0.0.1:${server.address().port}/api`;
  try {
    frontend = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { cwd: path.resolve(__dirname, '../../frontend'), env: { ...process.env, VITE_API_URL: api }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let startup = '';
    frontend.stdout.on('data', chunk => startup += chunk); frontend.stderr.on('data', chunk => startup += chunk);
    for (let i = 0; i < 100 && !startup.includes('http://127.0.0.1:5173'); i++) {
      if (frontend.exitCode !== null) throw new Error('Frontend startup failed');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(startup.includes('http://127.0.0.1:5173'));
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const detail = page.getByRole('article', { name: 'Chi tiết Ticket' });
    async function check(name, work) {
      try { await work(); results.push({ name, status: 'PASS' }); console.log('PASS', name); }
      catch (error) { results.push({ name, status: 'FAIL', message: error.message }); throw error; }
    }
    async function login(role) {
      await page.goto('http://127.0.0.1:5173');
      await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
      await page.getByLabel('Email', { exact: true }).fill(`${role}@test.local`);
      await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.SEED_USER_PASSWORD);
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
      await page.getByRole('heading', { name: /^Xin chào,/ }).waitFor();
      await page.getByRole('heading', { name: role === 'employee' ? 'Yêu cầu hỗ trợ của tôi' : 'Quản lý yêu cầu', exact: true }).waitFor();
    }
    async function logout() {
      await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
      await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
    }
    async function state(label) { await detail.locator('dd').filter({ hasText: new RegExp(`^${label}$`) }).waitFor(); }
    async function act(button, route, expectedState) {
      const response = page.waitForResponse(r => r.url() === `${api}/tickets/${ticket.id}/${route}` && r.request().method() === 'PATCH');
      await detail.getByRole('button', { name: button, exact: true }).click();
      assert.equal((await response).status(), 200);
      if (expectedState) await state(expectedState);
    }
    await check('EMPLOYEE: login, create, list, detail, initial history', async () => {
      await login('employee');
      await page.getByRole('button', { name: 'Tạo yêu cầu', exact: true }).click();
      await page.getByLabel('Tiêu đề', { exact: true }).fill('Demo giao diện: Không kết nối được Wi-Fi văn phòng');
      await page.getByLabel('Mô tả sự cố', { exact: true }).fill('Máy tính không kết nối được Wi-Fi. Cần IT kiểm tra cấu hình mạng.');
      const created = page.waitForResponse(r => r.url() === `${api}/tickets` && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Gửi yêu cầu', exact: true }).click();
      const response = await created; assert.equal(response.status(), 201); ticket = (await response.json()).ticket;
      await detail.getByRole('heading', { name: `Chi tiết ${ticket.code}`, exact: true }).waitFor();
      await state('Mới'); await state('Thấp'); await state('Chưa tiếp nhận'); await state('Chưa có giải pháp');
      assert.equal(await detail.locator('li').count(), 1);
      assert.equal(await detail.getByRole('button', { name: 'Tiếp nhận', exact: true }).count(), 0);
      await page.reload();
      await page.getByRole('button', { name: ticket.code, exact: true }).click();
      await state('Mới');
      await logout();
    });
    await check('IT: view employee ticket, accept, set HIGH, start, resolve, close', async () => {
      await login('it');
      await page.getByRole('button', { name: ticket.code, exact: true }).click();
      await act('Tiếp nhận', 'accept', 'Đã tiếp nhận');
      await state('Nhân viên IT thử nghiệm');
      await detail.getByLabel('Độ ưu tiên mới', { exact: true }).selectOption('HIGH');
      await act('Lưu độ ưu tiên', 'priority', 'Cao');
      await act('Bắt đầu xử lý', 'status', 'Đang xử lý');
      await detail.getByLabel('Giải pháp xử lý', { exact: true }).fill('Đã cấu hình lại driver Wi-Fi và kết nối lại mạng văn phòng.');
      await act('Đánh dấu đã giải quyết', 'status', 'Đã giải quyết');
      await act('Đóng Ticket', 'status', 'Đã đóng');
      assert.equal(await detail.locator('li').count(), 5);
      assert.equal(await detail.getByLabel('Độ ưu tiên mới', { exact: true }).count(), 0);
      await logout();
    });
    await check('EMPLOYEE: sees CLOSED, assignee, solution, five history entries', async () => {
      await login('employee');
      await page.getByRole('button', { name: ticket.code, exact: true }).click();
      await state('Đã đóng'); await state('Nhân viên IT thử nghiệm');
      assert.ok((await detail.textContent()).includes('Đã cấu hình lại driver Wi-Fi và kết nối lại mạng văn phòng.'));
      assert.equal(await detail.locator('li').count(), 5);
      await logout();
    });
    await check('ADMIN: view ticket and history, existing users API works', async () => {
      await login('admin');
      await page.getByRole('button', { name: ticket.code, exact: true }).click();
      await state('Đã đóng'); assert.equal(await detail.locator('li').count(), 5);
      const token = await page.evaluate(() => sessionStorage.getItem('it_support_token'));
      const response = await page.request.get(`${api}/users`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status(), 200); assert.ok((await response.json()).users.length >= 3);
      await page.screenshot({ path: path.resolve(__dirname, '../../docs/stage3-ticket-demo.png'), fullPage: true });
      await logout();
    });
    await check('No frontend JavaScript runtime errors', async () => assert.deepEqual(errors, []));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally {
    if (browser) await browser.close();
    if (frontend && frontend.exitCode === null) { const exit = new Promise(resolve => frontend.once('exit', resolve)); frontend.kill(); await exit; }
    server.close(); await pool.end();
    fs.writeFileSync(path.resolve(__dirname, '../../docs/stage3-browser-results.json'), JSON.stringify({ testedAt: new Date().toISOString(), browser: 'Microsoft Edge headless', results, demoTicket: ticket ? { id: ticket.id, code: ticket.code } : null }, null, 2) + '\n');
  }
});
