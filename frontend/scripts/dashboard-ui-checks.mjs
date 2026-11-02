// Synthetic read-only responses for the UI 5 runner; never imported by the app.
export function createDashboardFixture(user) {
  const fixture = { calls: [], tickets: [], articles: [], users: [], responses: {}, statuses: {}, holds: {}, waits: {} };
  fixture.reset = () => {
    fixture.responses = {}; fixture.statuses = {}; fixture.holds = {}; fixture.waits = {};
    const states = ['NEW', 'NEW', 'RECEIVED', 'IN_PROGRESS', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'RECEIVED', 'RESOLVED', 'CLOSED'];
    fixture.tickets = states.map((status, index) => ({ id: 101 + index, code: `TKT-${String(101 + index).padStart(6, '0')}`, title: `Sự cố giả lập ${index + 1}`, status, priority: 'LOW', created_by: [0, 2, 3, 5, 6].includes(index) ? 11 : 12, assigned_to: index < 2 ? null : [2, 3, 5, 6].includes(index) ? 11 : 22, assignee_name: index < 2 ? null : 'IT giả lập', created_at: `2026-11-02T08:${String(index + 1).padStart(2, '0')}:00Z`, updated_at: '2026-11-02T09:00:00Z', description: 'Dữ liệu kiểm thử', solution: '', history: [] }));
    fixture.articles = ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'PUBLISHED', 'DRAFT'].map((status, index) => ({ id: index + 1, code: `KB-${String(index + 1).padStart(6, '0')}`, title: 'Hướng dẫn giả lập', content: 'Nội dung kiểm thử', status, creator_name: 'Người kiểm thử', updated_at: '2026-11-02T08:00:00Z' }));
    fixture.users = [
      { id: 11, role: 'ADMIN', status: 'ACTIVE' }, { id: 12, role: 'IT', status: 'ACTIVE' }, { id: 13, role: 'IT', status: 'INACTIVE' }, { id: 14, role: 'EMPLOYEE', status: 'ACTIVE' }, { id: 15, role: 'EMPLOYEE', status: 'INACTIVE' },
    ];
  };
  fixture.reset();
  fixture.handle = async (route, request) => {
    fixture.calls.push({ route, method: request.method, role: user().role });
    if (request.method !== 'GET') throw new Error('Dashboard must not write data');
    if (route === '/users' && user().role !== 'ADMIN') throw new Error('Unauthorized account lookup');
    if (fixture.holds[route]) return { hold: true };
    const status = fixture.statuses[route] || 200;
    const body = fixture.responses[route] ?? (route === '/tickets' ? { success: true, tickets: fixture.tickets.filter(row => user().role !== 'EMPLOYEE' || row.created_by === user().id) }
      : route === '/knowledge' ? { success: true, articles: fixture.articles.filter(row => user().role !== 'EMPLOYEE' || row.status === 'PUBLISHED') } : { success: true, users: fixture.users });
    if (fixture.waits[route]) await new Promise(resolve => setTimeout(resolve, fixture.waits[route]));
    return { status, body: status === 200 ? body : { success: false, message: 'Lỗi giả lập' } };
  };
  return fixture;
}

export async function runDashboardChecks(ctx) {
  const { assert, check, evaluate, waitFor, until, click, nav, login, send, noOverflow, screenshot, fixture, setRole } = ctx;
  const source = name => `.dashboard [data-source="${name}"]`;
  const state = (name, value) => until(() => evaluate(`document.querySelector(${JSON.stringify(source(name))})?.dataset.sourceStatus===${JSON.stringify(value)}`), `${name} source should be ${value}`);
  const settle = () => until(() => evaluate("!!document.querySelector('.dashboard') && !document.querySelector('.dashboard [data-source-status=\"loading\"]')"), 'Dashboard not settled');
  const value = (name, key) => evaluate(`document.querySelector('${source(name)} [data-metric="${key}"] .dashboard-metric-value, ${source(name)} strong[data-metric="${key}"]').textContent`);
  const distribution = (name, key) => evaluate(`document.querySelector('${source(name)} [data-distribution="${key}"] strong').textContent`);
  const refresh = async name => { await click(`${source(name)} .dashboard-panel-heading button`); await settle(); };
  const emptyNumbers = async name => assert.equal(await evaluate(`document.querySelectorAll('${source(name)} [data-metric], ${source(name)} .dashboard-distribution').length`), 0);
  const ids = () => evaluate("Array.from(document.querySelectorAll('.dashboard-ticket-list [data-ticket-id]')).map(el=>Number(el.dataset.ticketId))");
  const logout = async () => { await click('[aria-label="Đăng xuất"]'); await waitFor('.login-page'); };

  await check('EMPLOYEE loading does not show zeros; exact own counts and recent order', async () => {
    fixture.waits['/tickets'] = 700; fixture.waits['/knowledge'] = 700; await login('.dashboard');
    await state('tickets', 'loading'); await emptyNumbers('tickets'); await emptyNumbers('knowledge');
    await settle(); fixture.waits = {};
    assert.equal(await value('tickets', 'total'), '5'); assert.equal(await value('tickets', 'in-progress'), '1'); assert.equal(await value('tickets', 'resolved'), '1');
    for (const status of ['NEW', 'RECEIVED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) assert.equal(await distribution('tickets', status), '1');
    assert.deepEqual(await ids(), [107, 106, 104, 103, 101]);
    assert.equal(await value('knowledge', 'knowledge-total'), '2');
    assert.equal(await evaluate("!!document.querySelector('[data-source=\"users\"]')"), false);
    assert.equal(fixture.calls.some(call => call.route === '/users'), false); await noOverflow(); await screenshot('01-dashboard-employee');
  });
  await check('Defensive employee scope excludes foreign tickets and unpublished KB', async () => {
    fixture.responses['/tickets'] = { tickets: fixture.tickets }; fixture.responses['/knowledge'] = { articles: fixture.articles };
    await refresh('tickets'); await refresh('knowledge'); assert.equal(await value('tickets', 'total'), '5'); assert.equal(await value('knowledge', 'knowledge-total'), '2');
    fixture.responses = {};
  });
  await check('Employee shortcuts route to existing Ticket, KB and AI without writes', async () => {
    await click('[data-shortcut="tickets"]'); await waitFor('.tickets tbody tr');
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.tickets button')).some(b=>b.textContent==='Tạo yêu cầu')"), true);
    await nav('Tổng quan'); await settle(); await click('[data-shortcut="knowledge"]'); await waitFor('.kb-list');
    await nav('Tổng quan'); await settle(); await click('[data-shortcut="rag"]'); await waitFor('.rag-form');
    assert.equal(fixture.calls.every(call => call.method === 'GET'), true); await nav('Tổng quan'); await settle();
  });
  await check('Missing or invalid timestamps are not invented and do not change totals', async () => {
    fixture.tickets.find(row => row.id === 107).created_at = null;
    fixture.tickets.find(row => row.id === 106).created_at = 'not-a-date';
    await refresh('tickets'); assert.equal(await value('tickets', 'total'), '5'); assert.deepEqual(await ids(), [104, 103, 101]);
    assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.dashboard-ticket-list time')).map(el=>el.dateTime)"), ['2026-11-02T08:04:00.000Z', '2026-11-02T08:03:00.000Z', '2026-11-02T08:01:00.000Z']);
    fixture.tickets.forEach(row => { delete row.created_at; }); await refresh('tickets'); assert.equal(await value('tickets', 'total'), '5'); assert.deepEqual(await ids(), []);
    assert.equal(await evaluate("document.querySelector('.dashboard-recent').textContent.includes('Chưa có ngày tạo hợp lệ')"), true);
    fixture.reset(); await logout();
  });

  setRole('IT'); await login();
  await check('IT exact NEW/assigned/own in-progress metrics and actionable queue', async () => {
    assert.equal(await value('tickets', 'new'), '2'); assert.equal(await value('tickets', 'assigned'), '4'); assert.equal(await value('tickets', 'in-progress'), '1');
    assert.deepEqual(await ids(), [106, 104, 103, 102, 101]);
    assert.equal(await value('knowledge', 'knowledge-total'), '5');
    assert.equal(await distribution('knowledge', 'DRAFT'), '2'); assert.equal(await distribution('knowledge', 'PUBLISHED'), '2'); assert.equal(await distribution('knowledge', 'ARCHIVED'), '1');
    assert.equal(fixture.calls.filter(call => call.role === 'IT').some(call => call.route === '/users'), false);
    assert.equal(await evaluate("document.querySelector('[data-shortcut=\"tickets\"] h3').textContent"), 'Quản lý Ticket'); await screenshot('02-dashboard-it');
  });
  await check('IT no actionable work is distinct from no tickets', async () => {
    fixture.tickets = fixture.tickets.filter(row => row.status === 'CLOSED'); await refresh('tickets');
    assert.equal(await value('tickets', 'assigned'), '1'); assert.equal(await value('tickets', 'new'), '0'); assert.deepEqual(await ids(), []);
    assert.equal(await evaluate("document.querySelector('.dashboard-list-empty').textContent.includes('Không có yêu cầu cần xử lý')"), true);
    fixture.reset(); await logout();
  });

  setRole('ADMIN'); await login();
  await check('ADMIN exact ticket, KB and account statistics from three real response shapes', async () => {
    assert.equal(await value('tickets', 'total'), '10'); assert.equal(await value('tickets', 'new'), '2'); assert.equal(await value('tickets', 'in-progress'), '2');
    for (const status of ['NEW', 'RECEIVED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) assert.equal(await distribution('tickets', status), '2');
    assert.deepEqual(await ids(), [110, 109, 108, 107, 106]);
    assert.equal(await value('knowledge', 'knowledge-total'), '5'); assert.equal(await value('users', 'users-total'), '5');
    for (const [role, count] of [['ADMIN', '1'], ['IT', '2'], ['EMPLOYEE', '2']]) assert.equal(await distribution('users', role), count);
    assert.equal(await evaluate("document.querySelector('[data-account-status=\"ACTIVE\"] dd').textContent"), '3');
    assert.equal(await evaluate("document.querySelector('[data-account-status=\"INACTIVE\"] dd').textContent"), '2');
    assert.equal(fixture.calls.filter(call => call.route === '/users').every(call => call.role === 'ADMIN'), true);
    assert.equal(await evaluate("Array.from(document.querySelectorAll('[data-source=\"tickets\"] .dashboard-bar span')).every(el=>el.style.width==='20%')"), true);
    await noOverflow(); await screenshot('03-dashboard-admin');
  });
  await check('Each source error hides its numbers while other sources remain usable; retry recovers', async () => {
    for (const [name, route, code] of [['tickets', '/tickets', 500], ['knowledge', '/knowledge', 503], ['users', '/users', 403]]) {
      fixture.statuses[route] = code; await refresh(name); await state(name, 'error'); await emptyNumbers(name);
      for (const other of ['tickets', 'knowledge', 'users'].filter(value => value !== name)) await state(other, 'success');
      fixture.statuses[route] = 200; await click(`${source(name)} .dashboard-source-error button`); await state(name, 'success');
    }
  });
  await check('Malformed response, unknown status and duplicate IDs never produce fabricated zero counts', async () => {
    for (const body of [{ wrong: [] }, { tickets: null }, { success: false, tickets: [] }, { tickets: [{ ...fixture.tickets[0], status: 'UNKNOWN' }] }, { tickets: [fixture.tickets[0], fixture.tickets[0]] }]) {
      fixture.responses['/tickets'] = body; await refresh('tickets'); await state('tickets', 'error'); await emptyNumbers('tickets');
    }
    fixture.responses['/knowledge'] = { articles: [{ id: 1, status: 'UNKNOWN' }] }; await refresh('knowledge'); await state('knowledge', 'error'); await emptyNumbers('knowledge');
    fixture.responses['/users'] = { users: [{ id: 1, role: 'ADMIN', status: 'UNKNOWN' }] }; await refresh('users'); await state('users', 'error'); await emptyNumbers('users');
    fixture.responses = {}; await click('.dashboard-welcome button'); await settle();
  });
  await check('Successful empty arrays show actual zeros and honest empty states', async () => {
    fixture.tickets = []; fixture.articles = []; fixture.users = []; await click('.dashboard-welcome button'); await settle();
    assert.equal(await value('tickets', 'total'), '0'); assert.equal(await value('knowledge', 'knowledge-total'), '0'); assert.equal(await value('users', 'users-total'), '0');
    assert.equal(await evaluate("document.querySelector('[data-source=\"tickets\"] .empty-state h2').textContent"), 'Chưa có Ticket');
    assert.equal(await evaluate("document.querySelectorAll('.dashboard-distribution').length"), 0);
    fixture.reset(); await click('.dashboard-welcome button'); await settle();
  });
  await check('Held request stays loading without zeros; unmount aborts it and role downgrade removes admin data', async () => {
    fixture.holds['/users'] = true; await click(`${source('users')} .dashboard-panel-heading button`); await state('users', 'loading'); await emptyNumbers('users');
    const before = fixture.calls.filter(call => call.route === '/users').length;
    setRole('EMPLOYEE'); await evaluate("window.dispatchEvent(new Event('focus'))"); await until(() => evaluate("document.querySelector('.dashboard')?.dataset.role==='EMPLOYEE'"), 'Dashboard role not changed'); await settle();
    assert.equal(await evaluate("!!document.querySelector('[data-source=\"users\"]')"), false); assert.equal(fixture.calls.filter(call => call.route === '/users').length, before);
    assert.equal(await value('tickets', 'total'), '5'); assert.equal(await value('knowledge', 'knowledge-total'), '2'); fixture.holds = {};
  });
  await check('Dashboard 401 follows global logout', async () => {
    fixture.statuses['/tickets'] = 401; await click(`${source('tickets')} .dashboard-panel-heading button`); await waitFor('.login-page');
    assert.equal(await evaluate("sessionStorage.getItem('it_support_token')===null"), true); fixture.reset();
  });
  for (const role of ['EMPLOYEE', 'IT', 'ADMIN']) {
    setRole(role); await login();
    await check(role + ' responsive 390/320px, accessible chart labels and keyboard shortcut', async () => {
      for (const width of [390, 320]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 844, mobile: true, deviceScaleFactor: 1 }); await noOverflow();
        assert.equal(await evaluate("document.querySelector('.dashboard-distribution').getAttribute('aria-label')"), 'Số Ticket theo từng trạng thái');
        if (width === 390) { await evaluate('window.scrollTo(0,0)'); await screenshot(`04-dashboard-${role.toLowerCase()}-mobile`); }
      }
      await evaluate("document.querySelector('[data-shortcut=\"rag\"]').focus()");
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await waitFor('.rag-form');
      await click('[aria-label="Mở menu"]'); await logout();
    });
  }
  await check('Dashboard requests are GET-only and accounts are requested only as ADMIN', async () => {
    assert.equal(fixture.calls.every(call => call.method === 'GET'), true); assert.equal(fixture.calls.filter(call => call.route === '/users').every(call => call.role === 'ADMIN'), true);
  });
}
