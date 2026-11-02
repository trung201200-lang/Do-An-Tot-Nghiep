// Synthetic, in-memory accounts. Never persist or print request credentials.
export function createUsersFixture(currentUser, onSelfChange) {
  const fixture = { rows: [], calls: [], listStatus: 200, writeStatus: 200, wait: 0, listWait: 0, network: false, malformed: false, failRefresh: false, authWait: 0, authStarts: 0 };
  fixture.reset = () => {
    Object.assign(fixture, { listStatus: 200, writeStatus: 200, wait: 0, listWait: 0, network: false, malformed: false, failRefresh: false });
    fixture.rows = [
      { id: 11, name: 'Quản trị viên hiện tại', email: 'admin@example.invalid', role: 'ADMIN', status: 'ACTIVE' },
      { id: 12, name: 'Quản trị viên thứ hai', email: 'second@example.invalid', role: 'ADMIN', status: 'ACTIVE' },
      { id: 13, name: 'Kỹ thuật viên', email: 'it@example.invalid', role: 'IT', status: 'ACTIVE' },
      { id: 14, name: 'Nhân viên kiểm thử', email: 'employee@example.invalid', role: 'EMPLOYEE', status: 'ACTIVE' },
      { id: 15, name: 'Nhân viên cũ', email: 'inactive@example.invalid', role: 'EMPLOYEE', status: 'INACTIVE' },
    ].map(row => ({ ...row, created_at: '2026-11-02T08:00:00Z', updated_at: '2026-11-02T09:00:00Z' }));
  };
  fixture.reset();
  fixture.handle = async (route, request) => {
    const input = request.postData ? JSON.parse(request.postData) : undefined;
    const { method } = request;
    const audit = { route, method, keys: Object.keys(input || {}), callerRole: currentUser().role };
    // Deliberately never record input.password or the raw request body.
    fixture.calls.push(audit);
    if (currentUser().role !== 'ADMIN') throw new Error('Non-admin attempted users API');
    if (fixture.network) return { networkError: true };
    const fail = status => ({ status, body: { success: false, message: 'UNTRUSTED_TEST_MARKER' } });
    if (route === '/users' && method === 'GET') {
      if (fixture.listWait) await new Promise(resolve => setTimeout(resolve, fixture.listWait));
      return fixture.listStatus !== 200 ? fail(fixture.listStatus) : { status: 200, body: fixture.malformed ? { success: true, wrong: [] } : { success: true, users: fixture.rows } };
    }
    if (fixture.wait) await new Promise(resolve => setTimeout(resolve, fixture.wait));
    if (fixture.writeStatus !== 200) return fail(fixture.writeStatus);
    let updated;
    if (method === 'POST' && route === '/users') {
      if (Object.keys(input).sort().join(',') !== 'email,name,password,role,status') throw new Error('Unexpected account creation fields');
      if (!input.name || input.name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length > 254 || input.password.length < 8 || Buffer.byteLength(input.password) > 72 || !['EMPLOYEE', 'IT', 'ADMIN'].includes(input.role) || !['ACTIVE', 'INACTIVE'].includes(input.status)) throw new Error('Invalid create payload');
      if (fixture.rows.some(row => row.email === input.email)) return fail(409);
      audit.fields = { name: input.name, email: input.email, role: input.role, status: input.status };
      updated = { id: Math.max(15, ...fixture.rows.map(row => row.id)) + 1, ...audit.fields };
      fixture.rows.unshift({ ...updated, created_at: '2026-11-02T10:00:00Z', updated_at: '2026-11-02T10:00:00Z' });
    } else if (method === 'PATCH' && /^\/users\/\d+\/(role|status)$/.test(route)) {
      const field = route.split('/')[3]; const target = fixture.rows.find(row => row.id === Number(route.split('/')[2]));
      if (!target) return fail(404);
      if (Object.keys(input).join(',') !== field) throw new Error('Unexpected access payload');
      if (!(field === 'role' ? ['EMPLOYEE', 'IT', 'ADMIN'] : ['ACTIVE', 'INACTIVE']).includes(input[field])) throw new Error('Invalid access value');
      const next = { ...target, [field]: input[field] }; audit.fields = { [field]: input[field] };
      if (target.role === 'ADMIN' && target.status === 'ACTIVE' && (next.role !== 'ADMIN' || next.status !== 'ACTIVE') && !fixture.rows.some(row => row.id !== target.id && row.role === 'ADMIN' && row.status === 'ACTIVE')) return fail(409);
      Object.assign(target, next); updated = { id: target.id, name: target.name, email: target.email, role: target.role, status: target.status };
      if (target.id === currentUser().id) onSelfChange(updated);
    } else throw new Error('Unsupported users endpoint');
    if (fixture.failRefresh) fixture.listStatus = 503;
    return { status: method === 'POST' ? 201 : 200, body: { success: true, user: updated } };
  };
  return fixture;
}

export async function runUsersChecks(ctx) {
  const { assert, check, evaluate, waitFor, until, click, fill, nav, login, send, noOverflow, screenshot, fixture, setRole, setMeStatus } = ctx;
  const writes = () => fixture.calls.filter(call => call.method !== 'GET');
  const button = label => evaluate(`Array.from(document.querySelectorAll('.user-management button')).find(b=>b.textContent.trim()===${JSON.stringify(label)})?.click()`);
  const select = (id, value) => evaluate(`(() => { const el=document.getElementById(${JSON.stringify(id)}); el.value=${JSON.stringify(value)}; el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  const settled = () => until(() => evaluate("!document.querySelector('.user-management .loading-state')"), 'Users operation pending');
  const rows = count => until(() => evaluate(`document.querySelectorAll('.user-list > li').length===${count}`), `Expected ${count} users`);
  const open = async id => { await click(`[data-open-user="${id}"]`); await waitFor('.user-access'); };
  const back = async () => { await button('← Quay lại danh sách'); await waitFor('#user-search'); };
  const refresh = async () => { await button('Làm mới danh sách'); await settled(); };
  const confirm = async () => { await waitFor('dialog[open]'); await click('dialog .ui-button--primary'); await settled(); };
  const escape = () => send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  const logout = async () => { await click('[aria-label="Đăng xuất"]'); await waitFor('.login-page'); };
  const adminLogin = async () => { setRole('ADMIN'); setMeStatus(200); await login(); await nav('Quản lý người dùng'); await rows(fixture.rows.length); await settled(); };
  const secret = 'UNTRUSTED_TEST_MARKER'; // Synthetic input, never printed by this test.
  const noSecret = async () => {
    assert.equal(await evaluate(`document.body.textContent.includes(${JSON.stringify(secret)})`), false);
    assert.equal(await evaluate("document.querySelector('#user-password')?.value || ''"), '');
    assert.deepEqual(await evaluate('Object.keys(sessionStorage)'), ['it_support_token']); assert.equal(await evaluate('localStorage.length'), 0);
  };
  for (const role of ['EMPLOYEE', 'IT']) {
    setRole(role); await login();
    await check(role + ' cannot see admin menu or reach users screen through URL state', async () => {
      assert.equal(await evaluate("Array.from(document.querySelectorAll('.sidebar__nav button')).some(b=>b.textContent==='Quản lý người dùng')"), false);
      await evaluate("history.replaceState({},'', '/?section=users#users')");
      assert.equal(await evaluate("!!document.querySelector('.user-management')"), false);
      assert.equal(fixture.calls.some(call => call.callerRole === role), false);
      await evaluate("history.replaceState({},'', '/')");
    }); await logout();
  }
  setRole('ADMIN'); await login(); fixture.listWait = 500; await nav('Quản lý người dùng');
  await check('ADMIN loading, actual list, labels and keyboard open/back', async () => {
    await waitFor('.user-management .loading-state'); assert.equal(await evaluate("!!document.querySelector('.user-list')"), false);
    await rows(5); await settled(); fixture.listWait = 0;
    await evaluate("document.querySelector('[data-open-user=\"13\"]').focus()");
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await waitFor('.user-access');
    await until(() => evaluate("document.activeElement.matches('.user-heading h2')"), 'Access heading focus missing');
    await back(); await until(() => evaluate("document.activeElement.dataset.openUser==='13'"), 'Return focus missing');
    await noOverflow(); await screenshot('01-users-desktop');
  });
  await check('Search name/email/ID and combined role/status filters are client-side', async () => {
    const count = fixture.calls.length;
    await fill('#user-search', '  KỸ THUẬT '); await rows(1); await fill('#user-search', 'EMPLOYEE@EXAMPLE.INVALID'); await rows(1); await fill('#user-search', '15'); await rows(1);
    await fill('#user-search', ''); await select('user-role-filter', 'EMPLOYEE'); await select('user-status-filter', 'INACTIVE'); await rows(1);
    await fill('#user-search', 'không tồn tại'); await waitFor('.user-management .empty-state');
    assert.equal(await evaluate("document.querySelector('.user-management .empty-state h2').textContent"), 'Không tìm thấy tài khoản phù hợp');
    await button('Xóa bộ lọc'); await rows(5); assert.equal(fixture.calls.length, count);
  });
  await check('Create validation matches backend length, email and UTF-8 password limits', async () => {
    await button('Tạo tài khoản'); await waitFor('.user-form'); const count = writes().length;
    await button('Tạo tài khoản'); await waitFor('#user-name-error'); await waitFor('#user-email-error'); await waitFor('#user-password-error');
    await until(() => evaluate("document.activeElement.id==='user-name'"), 'Validation focus missing');
    await fill('#user-name', 'x'.repeat(101)); await fill('#user-email', 'invalid'); await fill('#user-password', 'ế'.repeat(25)); await button('Tạo tài khoản');
    assert.equal(writes().length, count); assert.equal(await evaluate("document.querySelector('#user-password').type"), 'password');
    await fill('#user-name', '  Người dùng mới  '); await fill('#user-email', '  NEW@EXAMPLE.INVALID  '); await fill('#user-password', 'short'); await button('Tạo tài khoản'); await waitFor('#user-password-error'); assert.equal(writes().length, count);
    await screenshot('02-user-create-validation');
  });
  await check('Create API errors retain non-sensitive fields, clear password and never echo server input', async () => {
    for (const status of [400, 409, 500]) {
      fixture.writeStatus = status; await fill('#user-password', secret); await button('Tạo tài khoản'); await waitFor('.user-management > [role="alert"]'); await settled(); await noSecret();
      assert.equal(await evaluate("document.querySelector('#user-name').value"), '  Người dùng mới  ');
      assert.equal(await evaluate("document.querySelector('#user-email').value.trim()"), 'NEW@EXAMPLE.INVALID');
      if (status === 409) await waitFor('#user-email-error');
    }
    fixture.writeStatus = 200;
  });
  await check('Create sends exact normalized payload, permits 72 UTF-8 bytes and prevents duplicates', async () => {
    await fill('#user-password', 'ế'.repeat(24)); await select('user-role', 'IT'); await select('user-status', 'INACTIVE'); fixture.wait = 500; const count = writes().length;
    await button('Tạo tài khoản'); await evaluate("document.querySelector('.user-form').requestSubmit()"); await noSecret();
    await rows(6); await settled(); fixture.wait = 0;
    assert.equal(writes().length, count + 1); assert.deepEqual(writes().at(-1).keys.sort(), ['email', 'name', 'password', 'role', 'status']);
    assert.deepEqual(writes().at(-1).fields, { name: 'Người dùng mới', email: 'new@example.invalid', role: 'IT', status: 'INACTIVE' }); await noSecret();
  });
  await check('Role change requires confirmation, supports cancel/Escape and updates only role', async () => {
    await open(14); await select('user-edit-role', 'IT'); const count = writes().length;
    await evaluate("Array.from(document.querySelectorAll('.user-access button')).find(b=>b.textContent==='Lưu vai trò').focus()");
    await button('Lưu vai trò'); await waitFor('dialog[open]'); assert.equal(writes().length, count);
    assert.equal(await evaluate("document.activeElement.textContent"), 'Hủy');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', modifiers: 8, windowsVirtualKeyCode: 9 });
    assert.equal(await evaluate("!!document.activeElement.closest('dialog')"), true); await escape();
    await until(() => evaluate("!document.querySelector('dialog[open]')"), 'Dialog did not close');
    assert.equal(await evaluate("document.activeElement.textContent"), 'Lưu vai trò'); assert.equal(writes().length, count);
    await button('Lưu vai trò'); await confirm(); assert.equal(fixture.rows.find(row => row.id === 14).role, 'IT');
    assert.equal(writes().at(-1).route, '/users/14/role'); assert.deepEqual(writes().at(-1).fields, { role: 'IT' });
    await screenshot('03-user-access-desktop');
  });
  await check('Status confirmation permits deactivation/reactivation with status-only payload', async () => {
    for (const status of ['INACTIVE', 'ACTIVE']) {
      await select('user-edit-status', status); const count = writes().length; await button('Lưu trạng thái'); await waitFor('dialog[open]'); assert.equal(writes().length, count);
      await confirm(); assert.deepEqual(writes().at(-1).fields, { status }); assert.equal(writes().at(-1).route, '/users/14/status');
    } await back();
  });
  await check('Last ACTIVE ADMIN is protected by server 409; inactive admins do not count', async () => {
    fixture.rows.find(row => row.id === 12).status = 'INACTIVE'; await refresh(); await open(11);
    assert.equal(await evaluate("document.querySelector('.user-access').textContent.includes('ADMIN đang hoạt động cuối cùng')"), true);
    await select('user-edit-role', 'EMPLOYEE'); await button('Lưu vai trò'); await confirm(); await waitFor('.user-management > [role="alert"]');
    assert.equal(fixture.rows.find(row => row.id === 11).role, 'ADMIN');
    await select('user-edit-status', 'INACTIVE'); await button('Lưu trạng thái'); await confirm(); assert.equal(fixture.rows.find(row => row.id === 11).status, 'ACTIVE');
    await noSecret(); await back(); fixture.reset(); await refresh();
  });
  await check('Last-admin rule is checked again against changed server data at confirmation', async () => {
    await open(12); await select('user-edit-role', 'IT'); await button('Lưu vai trò'); await waitFor('dialog[open]');
    fixture.rows.find(row => row.id === 11).status = 'INACTIVE'; await confirm();
    assert.equal(fixture.rows.find(row => row.id === 12).role, 'ADMIN'); await waitFor('.user-management > [role="alert"]');
    fixture.reset(); await back(); await refresh();
  });
  await check('Refresh failure after successful create cannot repeat POST; retry loads saved account', async () => {
    await button('Tạo tài khoản'); await fill('#user-name', 'Tạo thành công'); await fill('#user-email', 'saved@example.invalid'); await fill('#user-password', secret); fixture.failRefresh = true; const count = writes().length;
    await button('Tạo tài khoản'); await waitFor('.user-management .empty-state'); await settled(); await noSecret();
    assert.equal(writes().length, count + 1); assert.equal(await evaluate("!!document.querySelector('.user-form')"), false);
    fixture.failRefresh = false; fixture.listStatus = 200; await button('Thử lại'); await rows(6); await settled();
  });
  await check('Refresh failure after PATCH disables stale mutation until a fresh list arrives', async () => {
    await open(13); fixture.failRefresh = true; await select('user-edit-role', 'EMPLOYEE'); await button('Lưu vai trò'); await confirm();
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.user-access button')).every(b=>b.disabled)"), true);
    fixture.failRefresh = false; fixture.listStatus = 200; await refresh(); assert.equal(await evaluate("document.querySelector('#user-edit-role').disabled"), false);
    fixture.writeStatus = 404; await select('user-edit-role', 'IT'); await button('Lưu vai trò'); await confirm(); await waitFor('.user-management > [role="alert"]');
    assert.equal(await evaluate("document.querySelector('#user-edit-role').disabled"), true); fixture.writeStatus = 200; await refresh(); await back();
  });
  await check('Network, malformed and empty-list states remain distinct', async () => {
    fixture.network = true; await refresh(); await waitFor('.user-management .empty-state');
    assert.equal(await evaluate("document.querySelector('.user-management .empty-state h2').textContent"), 'Chưa thể tải danh sách');
    fixture.network = false; fixture.malformed = true; await refresh(); assert.equal(await evaluate("!!document.querySelector('.user-list')"), false);
    fixture.malformed = false; fixture.rows = []; await refresh(); assert.equal(await evaluate("document.querySelector('.user-management .empty-state h2').textContent"), 'Chưa có tài khoản trong danh sách');
    fixture.reset(); await refresh();
  });
  await check('403 hides admin data and checks session; access can be retried', async () => {
    fixture.listStatus = 403; await refresh(); await waitFor('.user-management .empty-state'); assert.equal(await evaluate("document.querySelector('.user-management .empty-state h2').textContent"), 'Không có quyền quản trị');
    assert.equal(await evaluate("!!document.querySelector('.user-list') || !!document.querySelector('.user-form')"), false);
    fixture.listStatus = 200; await refresh(); await rows(5);
    await open(13); fixture.writeStatus = 403; await select('user-edit-role', 'EMPLOYEE'); await button('Lưu vai trò'); await confirm(); await waitFor('.user-management .empty-state');
    assert.equal(await evaluate("!!document.querySelector('.user-access')"), false); fixture.writeStatus = 200; await refresh(); await rows(5);
  });
  await check('Self-demotion is allowed when another ACTIVE ADMIN exists and removes admin UI immediately', async () => {
    await open(11); await select('user-edit-role', 'IT'); await button('Lưu vai trò'); await waitFor('dialog[open]');
    assert.equal(await evaluate("document.querySelector('dialog').textContent.includes('không còn quyền')"), true);
    const authStarts = fixture.authStarts; fixture.authWait = 700;
    await evaluate("window.dispatchEvent(new Event('focus'))"); await until(() => fixture.authStarts > authStarts, 'Delayed session check not started');
    await click('dialog .ui-button--primary'); await waitFor('.dashboard[data-role="IT"]');
    fixture.authWait = 0; await evaluate('new Promise(resolve=>setTimeout(resolve,800))');
    assert.equal(await evaluate("document.querySelector('.dashboard').dataset.role"), 'IT');
    assert.equal(await evaluate("!!document.querySelector('.user-management')"), false);
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.sidebar__nav button')).some(b=>b.textContent==='Quản lý người dùng')"), false); await logout();
  });
  fixture.reset(); await adminLogin();
  await check('Self-deactivation with another ACTIVE ADMIN logs out and clears session', async () => {
    await open(11); await select('user-edit-status', 'INACTIVE'); await button('Lưu trạng thái'); await waitFor('dialog[open]');
    assert.equal(await evaluate("document.querySelector('dialog').textContent.includes('phiên đăng nhập sẽ kết thúc')"), true);
    await click('dialog .ui-button--primary'); await waitFor('.login-page');
    assert.equal(await evaluate("sessionStorage.getItem('it_support_token')===null"), true);
  });
  fixture.reset(); await adminLogin();
  await check('401 logs out; external role downgrade removes an open management screen', async () => {
    fixture.listStatus = 401; await button('Làm mới danh sách'); await waitFor('.login-page'); fixture.reset(); await adminLogin();
    await open(13); setRole('EMPLOYEE'); await evaluate("window.dispatchEvent(new Event('focus'))"); await waitFor('.dashboard[data-role="EMPLOYEE"]');
    assert.equal(await evaluate("!!document.querySelector('.user-management')"), false); await logout();
  });
  fixture.reset(); await adminLogin();
  await check('Mobile list/form/access/confirmation at 390px and 320px', async () => {
    for (const width of [390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 844, mobile: true, deviceScaleFactor: 1 }); await noOverflow();
      if (width === 390) { await evaluate('window.scrollTo(0,0)'); await screenshot('04-users-mobile'); }
      await button('Tạo tài khoản'); await waitFor('.user-form'); await button('Tạo tài khoản'); await waitFor('#user-name-error'); await noOverflow();
      if (width === 390) await screenshot('05-user-create-mobile'); await button('Hủy'); await rows(5);
      await open(13); await select('user-edit-role', 'ADMIN'); await button('Lưu vai trò'); await waitFor('dialog[open]'); await noOverflow();
      assert.equal(await evaluate("document.querySelector('dialog').scrollWidth <= document.querySelector('dialog').clientWidth"), true);
      if (width === 390) await screenshot('06-user-confirm-mobile'); await escape(); await back();
    }
    assert.equal(fixture.calls.every(call => call.callerRole === 'ADMIN'), true);
    assert.equal(fixture.calls.some(call => /delete|password|reset/.test(call.route)), false);
  });
}
