// UI 7: fault injection and late-response regression, all data synthetic.
export function createAuditFixture(user, tickets, knowledge) {
  const fixture = { overrides: new Map(), calls: [], tickets, knowledge };
  fixture.handle = async (route, request) => {
    fixture.calls.push({ route, method: request.method });
    if (request.method !== 'GET') throw new Error('Audit checks must remain read-only');
    if (fixture.overrides.has(route)) return fixture.overrides.get(route)();
    const reply = await (route.startsWith('/tickets') ? tickets : knowledge).handle(route, request);
    if (route === '/tickets' && reply.status === 200 && user().role === 'EMPLOYEE') {
      reply.body.tickets = reply.body.tickets.filter(row => row.created_by === user().id);
    }
    return reply;
  };
  return fixture;
}

export async function runAuditChecks(ctx) {
  const { assert, check, evaluate, waitFor, until, click, nav, login, send, noOverflow, screenshot, fixture, setRole } = ctx;
  const selected = process.argv.find(arg => arg.startsWith('--audit-case='))?.split('=')[1];
  const run = async (name, label, work) => { if (!selected || selected === name) await check(label, work); };
  const button = (screen, text) => evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(screen + ' button')})).find(b=>b.textContent.trim()===${JSON.stringify(text)})?.click()`);
  const settled = screen => until(() => evaluate(`!document.querySelector(${JSON.stringify(screen + ' .loading-state')})`), 'Screen request pending');
  const openTickets = async () => { await nav('Yêu cầu hỗ trợ'); await waitFor('.ticket-table tbody tr'); };
  const logout = async () => { await click('[aria-label="Đăng xuất"]'); await waitFor('.login-page'); };

  await run('role', 'Late privileged Ticket detail cannot reappear after role downgrade', async () => {
    setRole('ADMIN'); fixture.tickets.rows[0].created_by = 22;
    await login(); await openTickets();
    let release;
    const snapshot = structuredClone(fixture.tickets.rows[0]);
    fixture.overrides.set('/tickets/101', () => new Promise(resolve => { release = () => resolve({ status: 200, body: { ticket: snapshot } }); }));
    await click('.ticket-table [data-open-ticket="101"]'); await until(() => Boolean(release), 'Detail request not captured');
    setRole('EMPLOYEE'); await evaluate("window.dispatchEvent(new Event('focus'))");
    await until(() => evaluate("document.querySelectorAll('.sidebar__nav button').length===4 && document.querySelector('.ticket-page h2')?.textContent==='Yêu cầu hỗ trợ của tôi'"), 'Role not updated');
    await until(() => evaluate("document.querySelectorAll('.ticket-table tbody tr').length===3"), 'Employee list not loaded');
    release(); await settled('.tickets');
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(await evaluate("!!document.querySelector('.ticket-detail')"), false, 'Privileged detail returned after role downgrade');
    assert.equal(await evaluate("!!document.querySelector('.ticket-processing')"), false);
    fixture.overrides.clear(); fixture.tickets.reset(); await logout();
  });
  await run('denied', 'Ticket detail is removed after refresh returns 403 or 404', async () => {
    setRole('IT'); await login();
    for (const status of [403, 404]) {
      await openTickets(); await click('.ticket-table [data-open-ticket="102"]'); await waitFor('.ticket-detail'); await settled('.tickets');
      fixture.overrides.set('/tickets/102', () => ({ status, body: { success: false, message: 'Không thể xem Ticket giả lập.' } }));
      await button('.tickets', 'Làm mới chi tiết'); await waitFor('.tickets [role="alert"]'); await settled('.tickets');
      assert.equal(await evaluate("!!document.querySelector('.ticket-detail')"), false, 'Denied or missing detail remains visible');
      assert.equal(await evaluate("!!document.querySelector('.ticket-processing')"), false);
      fixture.overrides.clear(); await nav('Tổng quan'); await waitFor('.dashboard');
    }
    await logout();
  });
  for (const [name, menu, path, screen, listKey, listSelector] of [
    ['ticket-data', 'Yêu cầu hỗ trợ', '/tickets', '.tickets', 'tickets', '.ticket-table tbody tr'],
    ['kb-data', 'Kho kiến thức', '/knowledge', '.knowledge', 'articles', '.kb-list > li'],
  ]) {
    await run(name, `${menu}: malformed lists show recoverable error, never empty success or blank app`, async () => {
      setRole('ADMIN'); await login();
      for (const bad of [{}, { [listKey]: null }, { [listKey]: [null] }]) {
        fixture.overrides.set(path, () => ({ status: 200, body: bad }));
        await nav(menu); await waitFor(`${screen} [role="alert"]`); await settled(screen);
        assert.equal(await evaluate("!!document.querySelector('.app-shell')"), true);
        assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(listSelector)}).length`), 0);
        fixture.overrides.clear(); await button(screen, 'Thử lại'); await waitFor(listSelector);
        await nav('Tổng quan'); await waitFor('.dashboard');
      }
      await logout();
    });
  }
  await run('responsive', 'Vietnamese shell and account navigation at 390/320px remain usable', async () => {
    setRole('ADMIN'); await login();
    for (const width of [390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 844, mobile: true, deviceScaleFactor: 1 });
      await noOverflow(); await click('[aria-label="Mở menu"]'); await waitFor('.sidebar--open');
      await nav('Quản lý người dùng'); await waitFor('.user-list'); await noOverflow();
      await until(() => evaluate("document.activeElement.id==='main-content'"), 'Navigation focus missing');
      assert.equal(await evaluate('document.documentElement.lang'), 'vi');
      await screenshot(`audit-users-${width}`);
    }
  });
  assert.equal(fixture.calls.every(call => call.method === 'GET'), true);
}
