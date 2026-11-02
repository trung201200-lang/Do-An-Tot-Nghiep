// Synthetic fixtures used only by the isolated browser runner; never by the app.
export function createTicketFixture(user) {
  const base = { description: 'Sự cố giả lập để kiểm tra giao diện.\nKhông chứa dữ liệu thật.', created_by: 11, creator_name: 'Nhân viên kiểm thử', assigned_to: null, assignee_name: null, created_at: '2026-11-02T08:00:00Z', updated_at: '2026-11-02T09:00:00Z', solution: '', history: [] };
  const fixture = { rows: [], calls: [], listStatus: 200, detailStatus: 200, mutationStatus: 200, waitList: 0, waitMutation: 0, failDetailAfterMutation: false };
  fixture.reset = () => {
    Object.assign(fixture, { listStatus: 200, detailStatus: 200, mutationStatus: 200, waitList: 0, waitMutation: 0, failDetailAfterMutation: false });
    fixture.rows = [
      { ...base, id: 101, code: 'TKT-000101', title: 'Không kết nối được Wi-Fi', priority: 'HIGH', status: 'NEW', history: [{ id: 1, old_status: null, new_status: 'NEW', actor_name: 'Nhân viên kiểm thử', created_at: base.created_at, note: 'Ticket được tạo (giả lập)' }] },
      { ...base, id: 102, code: 'TKT-000102', title: 'Máy in phòng họp', priority: 'MEDIUM', status: 'RECEIVED', assigned_to: 11, assignee_name: 'IT kiểm thử' },
      { ...base, id: 103, code: 'TKT-000103', title: 'Lỗi ứng dụng nội bộ', priority: 'LOW', status: 'IN_PROGRESS', assigned_to: 22, assignee_name: 'IT khác (giả lập)' },
      { ...base, id: 104, code: 'TKT-000104', title: 'Cài đặt màn hình', priority: 'LOW', status: 'CLOSED', assigned_to: 11, assignee_name: 'IT kiểm thử', solution: 'Giải pháp giả lập.' },
    ];
  };
  fixture.reset();
  fixture.handle = async (route, request) => {
    const { method } = request;
    const input = request.postData ? JSON.parse(request.postData) : undefined;
    fixture.calls.push({ route, method, input });
    const fail = status => ({ status, body: { message: 'Lỗi kiểm thử giả lập.' } });
    if (route === '/tickets' && method === 'GET') {
      if (fixture.waitList) await new Promise(resolve => setTimeout(resolve, fixture.waitList));
      return fixture.listStatus === 200 ? { status: 200, body: { tickets: fixture.rows } } : fail(fixture.listStatus);
    }
    if (method === 'GET' && /^\/tickets\/\d+$/.test(route)) {
      const ticket = fixture.rows.find(row => row.id === Number(route.split('/')[2]));
      return fixture.detailStatus !== 200 ? fail(fixture.detailStatus) : ticket ? { status: 200, body: { ticket } } : fail(404);
    }
    if (fixture.waitMutation) await new Promise(resolve => setTimeout(resolve, fixture.waitMutation));
    if (fixture.mutationStatus !== 200) return fail(fixture.mutationStatus);
    if (method === 'POST' && route === '/tickets') {
      if (user().role !== 'EMPLOYEE') throw new Error('Unauthorized create in UI test');
      if (Object.keys(input).sort().join(',') !== 'description,title') throw new Error('Unexpected create fields');
      const id = Math.max(100, ...fixture.rows.map(row => row.id)) + 1;
      const ticket = { ...base, id, code: `TKT-${String(id).padStart(6, '0')}`, ...input, priority: 'LOW', status: 'NEW' };
      fixture.rows.unshift(ticket);
      if (fixture.failDetailAfterMutation) fixture.detailStatus = 503;
      return { status: 201, body: { ticket } };
    }
    if (method === 'PATCH' && /^\/tickets\/\d+\/(accept|priority|status)$/.test(route)) {
      if (!['IT', 'ADMIN'].includes(user().role)) throw new Error('Unauthorized mutation in UI test');
      const ticket = fixture.rows.find(row => row.id === Number(route.split('/')[2]));
      const old = ticket.status;
      if (route.endsWith('/accept')) {
        if (ticket.status !== 'NEW' || Object.keys(input).length) throw new Error('Invalid accept');
        ticket.status = 'RECEIVED'; ticket.assigned_to = user().id; ticket.assignee_name = user().name;
      } else {
        if (ticket.status === 'CLOSED' || (user().role === 'IT' && ticket.assigned_to !== null && ticket.assigned_to !== user().id)) throw new Error('Invalid permission');
        if (route.endsWith('/priority')) {
          if (Object.keys(input).join(',') !== 'priority' || !['LOW', 'MEDIUM', 'HIGH'].includes(input.priority)) throw new Error('Invalid priority');
          ticket.priority = input.priority;
        } else {
          const transitions = { RECEIVED: ['IN_PROGRESS'], IN_PROGRESS: ['RESOLVED'], RESOLVED: ['IN_PROGRESS', 'CLOSED'] };
          if (!transitions[ticket.status]?.includes(input.status) || (user().role === 'IT' && ticket.assigned_to !== user().id)) throw new Error('Invalid transition');
          if (input.status === 'RESOLVED' && (!input.solution?.trim() || input.solution.length > 4000)) throw new Error('Invalid solution');
          Object.assign(ticket, input);
        }
      }
      if (old !== ticket.status) ticket.history.push({ id: Date.now(), old_status: old, new_status: ticket.status, actor_name: user().name, created_at: base.updated_at, note: 'Cập nhật giả lập' });
      if (fixture.failDetailAfterMutation) fixture.detailStatus = 503;
      return { status: 200, body: { ticket } };
    }
    throw new Error('Unexpected ticket API request');
  };
  return fixture;
}

export async function runTicketChecks(ctx) {
  const { assert, check, evaluate, waitFor, until, click, fill, nav, login, send, noOverflow, screenshot, fixture, setRole } = ctx;
  const button = text => evaluate(`Array.from(document.querySelectorAll('.tickets button')).find(b=>b.textContent.trim()===${JSON.stringify(text)} && b.getClientRects().length)?.click()`);
  const hasButton = text => evaluate(`Array.from(document.querySelectorAll('.tickets button')).some(b=>b.textContent.trim()===${JSON.stringify(text)} && b.getClientRects().length)`);
  const select = (id, value) => evaluate(`(() => { const el=document.getElementById(${JSON.stringify(id)}); el.value=${JSON.stringify(value)}; el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  const rows = () => evaluate("document.querySelectorAll('.ticket-table tbody tr').length");
  const waitRows = count => until(async () => await rows() === count, `Expected ${count} ticket rows`);
  const settled = () => until(() => evaluate("!document.querySelector('.tickets .loading-state')"), 'Request still pending');
  const writes = () => fixture.calls.filter(call => ['POST', 'PATCH'].includes(call.method));
  const open = async id => { await click(`.ticket-table [data-open-ticket="${id}"]`); await waitFor('.ticket-detail'); await settled(); };
  const back = async () => { await button('← Quay lại danh sách'); await waitFor('#ticket-search'); };
  const refresh = async () => { await button('Làm mới danh sách'); await settled(); };
  const detailStatus = status => until(() => evaluate(`!!document.querySelector('.ticket-detail__summary .ui-badge--status-${status}')`), 'Ticket status did not update');
  const logout = async () => { await click('[aria-label="Đăng xuất"]'); await waitFor('.login-page'); };

  await check('Employee list, loading and keyboard focus', async () => {
    fixture.waitList = 700; await login(); await nav('Yêu cầu hỗ trợ'); await waitFor('.tickets .loading-state'); await waitRows(4); fixture.waitList = 0;
    assert.equal(await hasButton('Tạo yêu cầu'), true); await noOverflow();
    await evaluate("document.querySelector('.ticket-table [data-open-ticket]').focus()");
    assert.equal(await evaluate("document.activeElement.dataset.openTicket"), '101');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await waitFor('.ticket-detail');
    await until(() => evaluate("document.activeElement.matches('.ticket-page__heading h2')"), 'Detail heading focus missing');
    assert.equal(await hasButton('Tiếp nhận'), false); assert.equal(await evaluate("document.querySelectorAll('.ticket-timeline li').length"), 1);
    await back(); await until(() => evaluate("document.activeElement.dataset.openTicket==='101'"), 'Return focus missing');
    await screenshot('01-ticket-list-desktop');
  });
  await check('Search code/title and combined status/priority filters', async () => {
    await fill('#ticket-search', 'tkt-000102'); await waitRows(1);
    await fill('#ticket-search', '  WI-FI '); await waitRows(1);
    const count = fixture.calls.length;
    await select('ticket-status-filter', 'NEW'); await select('ticket-priority-filter', 'HIGH'); await waitRows(1);
    await select('ticket-priority-filter', 'LOW'); await waitFor('.tickets .empty-state');
    assert.equal(await evaluate("document.querySelector('.empty-state h2').textContent"), 'Không tìm thấy yêu cầu phù hợp');
    await button('Xóa bộ lọc'); await waitRows(4); assert.equal(fixture.calls.length, count);
  });
  await check('Create validation, field messages, limits and cancel', async () => {
    await button('Tạo yêu cầu'); await waitFor('.ticket-form'); const count = writes().length;
    await fill('#ticket-title', '   '); await button('Gửi yêu cầu'); await waitFor('#ticket-title-error'); await waitFor('#ticket-description-error');
    assert.equal(writes().length, count);
    await until(() => evaluate("document.activeElement.id==='ticket-title'"), 'Validation focus missing');
    assert.equal(await evaluate("document.querySelector('#ticket-title').getAttribute('aria-invalid')"), 'true');
    assert.equal(await evaluate("document.querySelector('#ticket-title').maxLength"), 255);
    assert.equal(await evaluate("document.querySelector('#ticket-description').maxLength"), 4000);
    await fill('#ticket-title', 'x'.repeat(256)); await fill('#ticket-description', 'x'.repeat(4001)); await button('Gửi yêu cầu');
    await waitFor('#ticket-title-error'); await waitFor('#ticket-description-error'); assert.equal(writes().length, count);
    await screenshot('02-create-validation'); await button('Hủy'); await waitRows(4);
  });
  await check('Create failure keeps input; successful create sends only supported fields', async () => {
    await button('Tạo yêu cầu'); await fill('#ticket-title', '  Sự cố thử nghiệm  '); await fill('#ticket-description', '  Mô tả thử nghiệm.  ');
    fixture.mutationStatus = 400; await button('Gửi yêu cầu'); await waitFor('.tickets [role="alert"]'); await settled();
    assert.equal(await evaluate("document.querySelector('#ticket-title').value"), '  Sự cố thử nghiệm  ');
    fixture.mutationStatus = 200; fixture.waitMutation = 500; const count = writes().length;
    await button('Gửi yêu cầu'); await button('Gửi yêu cầu'); await waitFor('.ticket-detail'); await settled();
    assert.equal(writes().length, count + 1); assert.deepEqual(writes().at(-1).input, { title: 'Sự cố thử nghiệm', description: 'Mô tả thử nghiệm.' });
    await waitFor('.ticket-history'); assert.equal(await evaluate("document.querySelectorAll('.ticket-timeline li').length"), 0);
    await back(); await waitRows(5); fixture.waitMutation = 0;
  });
  await check('Detail errors 404/403 and list failure retry', async () => {
    for (const status of [404, 403]) {
      fixture.detailStatus = status; await click('.ticket-table [data-open-ticket="101"]'); await waitFor('.tickets [role="alert"]'); await settled(); assert.equal(await rows(), 5);
    }
    fixture.detailStatus = 200; fixture.listStatus = 503; await refresh(); await waitFor('.tickets .empty-state');
    assert.equal(await evaluate("document.querySelector('.empty-state h2').textContent"), 'Chưa thể tải danh sách');
    fixture.listStatus = 200; await button('Thử lại'); await waitRows(5);
  });
  await check('Successful create plus failed detail cannot repeat POST', async () => {
    fixture.failDetailAfterMutation = true; await button('Tạo yêu cầu'); await fill('#ticket-title', 'Đã tạo nhưng chưa tải chi tiết'); await fill('#ticket-description', 'Dữ liệu giả lập');
    const count = writes().length; await button('Gửi yêu cầu'); await waitFor('.tickets [role="alert"]'); await settled();
    assert.equal(await hasButton('Gửi yêu cầu'), false); assert.equal(writes().length, count + 1);
    fixture.reset(); await refresh(); await waitRows(4);
  });
  await check('Empty dataset is distinct from empty search results', async () => {
    fixture.rows = []; await refresh(); await waitFor('.tickets .empty-state');
    assert.equal(await evaluate("document.querySelector('.empty-state h2').textContent"), 'Chưa có yêu cầu hỗ trợ');
    fixture.reset(); await refresh(); await waitRows(4);
  });
  await check('Ticket API 401 retains global logout behavior', async () => {
    fixture.listStatus = 401; await button('Làm mới danh sách'); await waitFor('.login-page');
    assert.equal(await evaluate("sessionStorage.getItem('it_support_token')===null"), true); fixture.reset();
  });
  setRole('IT'); await login(); await nav('Yêu cầu hỗ trợ'); await waitRows(4);
  await check('IT role: no creation, other assignee readonly, closed readonly', async () => {
    assert.equal(await hasButton('Tạo yêu cầu'), false); await open(103);
    assert.equal(await evaluate("!!document.querySelector('.ticket-processing')"), false);
    assert.equal(await evaluate("document.querySelector('.ticket-metadata').textContent.includes('IT khác (giả lập)')"), true);
    await back(); await open(104); assert.equal(await evaluate("!!document.querySelector('.ticket-processing')"), false); await back();
  });
  await check('IT accepts NEW and updates priority without assignment fields', async () => {
    await open(101); await select('ticket-priority', 'MEDIUM'); await button('Lưu độ ưu tiên'); await settled();
    assert.deepEqual(writes().at(-1).input, { priority: 'MEDIUM' });
    await button('Tiếp nhận'); await detailStatus('RECEIVED'); await settled();
    assert.deepEqual(writes().at(-1).input, {}); assert.equal(fixture.rows.find(row => row.id === 101).assigned_to, 11);
    await button('Bắt đầu xử lý'); await detailStatus('IN_PROGRESS'); await settled();
    assert.deepEqual(writes().at(-1).input, { status: 'IN_PROGRESS' });
  });
  await check('Solution validation and resolve, reopen, resolve, close transitions', async () => {
    const count = writes().length; await fill('#ticket-solution', '   '); await button('Đánh dấu đã giải quyết'); await waitFor('#ticket-solution-error'); assert.equal(writes().length, count);
    await fill('#ticket-solution', 'x'.repeat(4001)); await button('Đánh dấu đã giải quyết'); await waitFor('#ticket-solution-error'); assert.equal(writes().length, count);
    await fill('#ticket-solution', '  Đã kiểm tra kết nối (giả lập).  '); await button('Đánh dấu đã giải quyết'); await detailStatus('RESOLVED'); await settled();
    assert.deepEqual(writes().at(-1).input, { status: 'RESOLVED', solution: 'Đã kiểm tra kết nối (giả lập).' });
    await button('Xử lý lại'); await detailStatus('IN_PROGRESS'); await settled();
    await fill('#ticket-solution', 'Giải pháp cập nhật (giả lập).'); await button('Đánh dấu đã giải quyết'); await detailStatus('RESOLVED'); await settled();
    await screenshot('03-ticket-detail-timeline');
    await button('Đóng Ticket'); await detailStatus('CLOSED'); await settled();
    assert.equal(await evaluate("!!document.querySelector('.ticket-processing')"), false);
    assert.equal(await evaluate("document.querySelectorAll('.ticket-timeline li').length"), 7); await back();
  });
  await check('Conflict error remains visible without changing detail', async () => {
    await open(102); fixture.mutationStatus = 409; await button('Bắt đầu xử lý'); await waitFor('.tickets [role="alert"]'); await settled(); await detailStatus('RECEIVED');
    fixture.mutationStatus = 200;
  });
  await check('Saved mutation with failed refresh blocks stale actions until refresh', async () => {
    fixture.failDetailAfterMutation = true; await button('Bắt đầu xử lý'); await waitFor('.tickets [role="alert"]'); await settled();
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.ticket-processing button')).every(b=>b.disabled)"), true);
    fixture.failDetailAfterMutation = false; fixture.detailStatus = 200; await button('Làm mới chi tiết'); await detailStatus('IN_PROGRESS'); await settled();
    assert.equal(await evaluate("document.querySelector('#ticket-solution').disabled"), false); await logout();
  });
  setRole('ADMIN'); fixture.reset(); await login(); await nav('Yêu cầu hỗ trợ'); await waitRows(4);
  await check('Admin can process another assignee; cannot create or mutate closed ticket', async () => {
    assert.equal(await hasButton('Tạo yêu cầu'), false); await open(103); await waitFor('#ticket-solution'); await waitFor('#ticket-priority');
    await fill('#ticket-solution', 'Giải pháp của quản trị viên (giả lập).'); await button('Đánh dấu đã giải quyết'); await detailStatus('RESOLVED'); await settled();
    await back(); await open(104); assert.equal(await evaluate("!!document.querySelector('.ticket-processing')"), false); await back();
    assert.equal(writes().some(call => /delete|assign/.test(call.route)), false);
  });
  await check('Mobile list, detail and keyboard at 390px and 320px', async () => {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 });
    await until(() => evaluate("getComputedStyle(document.querySelector('.ticket-table')).display==='none'"), 'Mobile list missing');
    await noOverflow(); await screenshot('04-ticket-list-mobile');
    await click('.ticket-mobile-list [data-open-ticket="101"]'); await waitFor('.ticket-detail'); await settled(); await noOverflow(); await screenshot('05-ticket-detail-mobile');
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 720, mobile: true, deviceScaleFactor: 1 }); await noOverflow(); await back(); await noOverflow();
    await until(() => evaluate("document.activeElement.dataset.openTicket==='101' && !!document.activeElement.closest('.ticket-mobile-list')"), 'Mobile return focus missing');
    await click('[aria-label="Mở menu"]'); await logout();
  });
  setRole('EMPLOYEE'); await login(); await click('[aria-label="Mở menu"]'); await nav('Yêu cầu hỗ trợ'); await waitRows(4);
  await check('Mobile create form and field errors remain accessible', async () => {
    await button('Tạo yêu cầu'); await waitFor('.ticket-form'); await button('Gửi yêu cầu'); await waitFor('#ticket-title-error'); await noOverflow();
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 }); await noOverflow(); await screenshot('06-ticket-create-mobile');
    assert.equal(await evaluate("document.querySelector('#ticket-title').getAttribute('aria-describedby').includes('ticket-title-error')"), true);
  });
}
