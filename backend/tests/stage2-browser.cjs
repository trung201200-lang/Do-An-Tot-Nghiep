// Công cụ Playwright đặt trong thư mục tạm, không phải dependency ứng dụng.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require(path.join(os.tmpdir(), 'it-support-browser-check/node_modules/playwright'));
const app = require('../src/app');
const pool = require('../src/config/db');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../src/config/jwt');
const results = [];
let frontend, browser;
const server = app.listen(0, '127.0.0.1', async () => {
  const api = `http://127.0.0.1:${server.address().port}/api`;
  const frontendUrl = 'http://127.0.0.1:5173';
  const errors = [];
  try {
    frontend = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
      cwd: path.resolve(__dirname, '../../frontend'),
      env: { ...process.env, VITE_API_URL: api },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let startup = '';
    frontend.stdout.on('data', data => startup += data);
    frontend.stderr.on('data', data => startup += data);
    for (let attempt = 0; attempt < 100 && !startup.includes(frontendUrl); attempt++) {
      if (frontend.exitCode !== null) throw new Error('Frontend exited before startup');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(startup.includes(frontendUrl), 'Frontend not ready');
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.name));
    async function check(name, action) {
      try { await action(); results.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); }
      catch (error) { results.push({ name, status: 'FAIL', error: error.name }); throw new Error(`FAIL ${name}`); }
    }
    for (const [role, label] of [['EMPLOYEE', 'Nhân viên'], ['IT', 'Nhân viên IT'], ['ADMIN', 'Quản trị viên']]) {
      await check(`Frontend ${role}: login, role display, reload, logout`, async () => {
        await page.goto(frontendUrl);
        await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
        await page.getByLabel('Email', { exact: true }).fill(`${role.toLowerCase()}@test.local`);
        await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.SEED_USER_PASSWORD);
        const loginResponse = page.waitForResponse(response => response.url() === `${api}/auth/login`);
        const meResponse = page.waitForResponse(response => response.url() === `${api}/auth/me` && response.status() === 200);
        await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
        assert.equal((await loginResponse).status(), 200);
        await meResponse;
        await page.getByRole('heading', { name: /^Xin chào,/ }).waitFor();
        assert.equal(await page.locator('strong').textContent(), label);
        assert.ok(await page.evaluate(() => Boolean(sessionStorage.getItem('it_support_token'))));
        await page.reload();
        await page.getByRole('heading', { name: /^Xin chào,/ }).waitFor();
        assert.equal(await page.locator('strong').textContent(), label);
        await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
        await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
        assert.equal(await page.evaluate(() => sessionStorage.getItem('it_support_token')), null);
        await page.reload();
        await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
      });
    }
    await check('Frontend wrong password shows error without session', async () => {
      await page.getByLabel('Email', { exact: true }).fill('employee@test.local');
      await page.getByLabel('Mật khẩu', { exact: true }).fill('incorrect-demo-password');
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
      await page.getByRole('alert').waitFor();
      assert.ok((await page.getByRole('alert').textContent()).includes('không đúng'));
      assert.equal(await page.evaluate(() => sessionStorage.getItem('it_support_token')), null);
    });
    for (const [name, token] of [['invalid', 'invalid-token'], ['expired', jwt.sign({}, getJwtSecret(), { subject: '1', expiresIn: -1 })]]) {
      await check(`Frontend ${name} JWT removed and login restored`, async () => {
        await page.evaluate(value => sessionStorage.setItem('it_support_token', value), token);
        await page.reload();
        await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
        assert.equal(await page.evaluate(() => sessionStorage.getItem('it_support_token')), null);
      });
    }
    await check('Frontend no JavaScript runtime errors', async () => assert.deepEqual(errors, []));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (frontend && frontend.exitCode === null) {
      const exit = new Promise(resolve => frontend.once('exit', resolve));
      frontend.kill(); await exit;
    }
    server.close(); await pool.end();
    fs.writeFileSync(path.resolve(__dirname, '../../docs/stage2-browser-results.json'), JSON.stringify({ testedAt: new Date().toISOString(), browser: 'Microsoft Edge headless', results }, null, 2) + '\n');
  }
});
