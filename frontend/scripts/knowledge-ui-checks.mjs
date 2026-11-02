// In-memory test data only; never imported by application code.
export function createKnowledgeFixture(user) {
  const base = { creator_name: 'Người soạn giả lập', updater_name: null, created_at: '2026-11-02T08:00:00Z', updated_at: '2026-11-02T09:00:00Z' };
  const fixture = { rows: [], calls: [], listStatus: 200, detailStatus: 200, writeStatus: 200, waitList: 0, waitWrite: 0, failRefresh: false };
  fixture.reset = () => {
    Object.assign(fixture, { listStatus: 200, detailStatus: 200, writeStatus: 200, waitList: 0, waitWrite: 0, failRefresh: false });
    fixture.rows = [
      { ...base, id: 8, code: 'KB-000008', title: 'Khắc phục lỗi Wi-Fi (giả lập)', content: 'Điều kiện áp dụng\nMáy thử nghiệm.\n\n1. Kiểm tra Wi-Fi.\n2. Thử kết nối lại.\n\n<img src=x onerror="window.__kbUnsafe=true">\n<script>window.__kbUnsafe=true</script>\n**Giữ nguyên ký tự** & < >', status: 'PUBLISHED' },
      { ...base, id: 9, code: 'KB-000009', title: 'Hướng dẫn máy in (giả lập)', content: 'Bản nháp giả lập.\nBước 1: Kiểm tra kết nối.', status: 'DRAFT' },
      { ...base, id: 10, code: 'KB-000010', title: 'Ứng dụng cũ (giả lập)', content: 'Nội dung lưu trữ giả lập.', status: 'ARCHIVED' },
    ];
  };
  fixture.reset();
  fixture.handle = async (route, request) => {
    const { method } = request;
    const input = request.postData ? JSON.parse(request.postData) : undefined;
    fixture.calls.push({ route, method, input });
    const fail = status => ({ status, body: { message: 'Lỗi API giả lập.' } });
    const manager = ['IT', 'ADMIN'].includes(user().role);
    if (route === '/knowledge' && method === 'GET') {
      if (fixture.waitList) await new Promise(resolve => setTimeout(resolve, fixture.waitList));
      return fixture.listStatus === 200 ? { status: 200, body: { articles: fixture.rows.filter(article => manager || article.status === 'PUBLISHED') } } : fail(fixture.listStatus);
    }
    const article = fixture.rows.find(row => row.id === Number(route.split('/')[2]));
    if (method === 'GET' && /^\/knowledge\/\d+$/.test(route)) {
      if (fixture.detailStatus !== 200) return fail(fixture.detailStatus);
      if (!article) return fail(404);
      if (!manager && article.status !== 'PUBLISHED') return fail(403);
      return { status: 200, body: { article } };
    }
    if (!manager) throw new Error('Unexpected employee mutation');
    if (fixture.waitWrite) await new Promise(resolve => setTimeout(resolve, fixture.waitWrite));
    if (fixture.writeStatus !== 200) return fail(fixture.writeStatus);
    let saved;
    if ((method === 'POST' && route === '/knowledge') || (method === 'PUT' && /^\/knowledge\/\d+$/.test(route))) {
      if (Object.keys(input).sort().join(',') !== 'content,title') throw new Error('Unsupported article payload');
      if (!input.title.trim() || [...input.title].length > 255 || !input.content.trim() || Buffer.byteLength(JSON.stringify(input)) > 16384) throw new Error('Invalid article payload');
      if (method === 'POST') {
        const id = Math.max(10, ...fixture.rows.map(row => row.id)) + 1;
        saved = { ...base, ...input, id, code: `KB-${String(id).padStart(6, '0')}`, status: 'DRAFT' }; fixture.rows.unshift(saved);
      } else { if (!article) return fail(404); Object.assign(article, input, { updater_name: user().name }); saved = article; }
    } else if (method === 'PATCH' && /^\/knowledge\/\d+\/status$/.test(route)) {
      if (!article) return fail(404);
      const transitions = { DRAFT: 'PUBLISHED', PUBLISHED: 'ARCHIVED', ARCHIVED: 'DRAFT' };
      if (Object.keys(input).join(',') !== 'status' || transitions[article.status] !== input.status) throw new Error('Invalid transition payload');
      Object.assign(article, input, { updater_name: user().name }); saved = article;
    } else throw new Error('Unsupported knowledge route');
    if (fixture.failRefresh) { fixture.detailStatus = 503; fixture.listStatus = 503; }
    return { status: method === 'POST' ? 201 : 200, body: { article: saved } };
  };
  return fixture;
}

export async function runKnowledgeChecks(ctx) {
  const { assert, check, evaluate, waitFor, until, click, fill, nav, login, send, noOverflow, screenshot, fixture, setRole } = ctx;
  const button = text => evaluate(`Array.from(document.querySelectorAll('.knowledge button')).find(b=>b.textContent.trim()===${JSON.stringify(text)} && b.getClientRects().length)?.click()`);
  const hasButton = text => evaluate(`Array.from(document.querySelectorAll('.knowledge button')).some(b=>b.textContent.trim()===${JSON.stringify(text)})`);
  const select = value => evaluate(`(() => { const el=document.querySelector('#kb-status-filter'); el.value=${JSON.stringify(value)}; el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  const waitRows = count => until(() => evaluate(`document.querySelectorAll('.kb-list > li').length===${count}`), `Expected ${count} KB rows`);
  const settled = () => until(() => evaluate("!document.querySelector('.knowledge .loading-state')"), 'KB operation pending');
  const open = async id => { await click(`[data-open-article="${id}"]`); await waitFor('.kb-content'); await settled(); };
  const back = async () => { await button('← Quay lại danh sách'); await waitFor('#kb-search'); };
  const refresh = async () => { await button('Làm mới kho kiến thức'); await settled(); };
  const writes = () => fixture.calls.filter(call => ['POST', 'PUT', 'PATCH'].includes(call.method));
  const statusIs = status => until(() => evaluate(`!!document.querySelector('.knowledge-article-heading .ui-badge--kb-${status}')`), 'Article status not updated');
  const dialog = () => waitFor('.ui-confirm-dialog[open]');
  const confirm = async () => { await dialog(); await click('.ui-confirm-dialog .ui-button--primary'); };
  const cancel = async () => { await dialog(); await click('.ui-confirm-dialog .ui-button--secondary'); };
  const escape = () => send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  const logout = async () => { await click('[aria-label="Đăng xuất"]'); await waitFor('.login-page'); };
  const readExact = async id => {
    assert.equal(await evaluate("document.querySelector('.kb-content').textContent"), fixture.rows.find(row => row.id === id).content);
    assert.equal(await evaluate("document.querySelector('.kb-content').children.length"), 0);
    assert.equal(await evaluate('Boolean(window.__kbUnsafe)'), false);
  };

  await check('EMPLOYEE sees published articles only, no management or status filter', async () => {
    fixture.waitList = 500; await login(); await nav('Kho kiến thức'); await waitFor('.knowledge .loading-state'); await waitRows(1); fixture.waitList = 0;
    assert.equal(await evaluate("!!document.querySelector('#kb-status-filter')"), false);
    assert.equal(await hasButton('Tạo bài viết'), false); await open(8); await readExact(8);
    assert.equal(await hasButton('Sửa bài'), false); assert.equal(await hasButton('Lưu trữ'), false); await noOverflow(); await back();
  });
  await check('EMPLOYEE code/title search, no result and filter clearing', async () => {
    const calls = fixture.calls.length;
    await fill('#kb-search', 'kb-000008'); await waitRows(1);
    await fill('#kb-search', '  WI-FI '); await waitRows(1);
    await fill('#kb-search', 'không có bài'); await waitFor('.knowledge .empty-state');
    assert.equal(await evaluate("document.querySelector('.empty-state h2').textContent"), 'Không tìm thấy bài viết phù hợp');
    await button('Xóa bộ lọc'); await waitRows(1); assert.equal(fixture.calls.length, calls); assert.equal(writes().length, 0);
  });
  await check('EMPLOYEE cannot open a newly archived article; 401 logs out', async () => {
    fixture.rows[0].status = 'ARCHIVED'; await click('[data-open-article="8"]'); await waitFor('.knowledge [role="alert"]'); await settled();
    assert.equal(await evaluate("!!document.querySelector('.kb-content')"), false);
    fixture.listStatus = 401; await button('Làm mới kho kiến thức'); await waitFor('.login-page');
    assert.equal(await evaluate("sessionStorage.getItem('it_support_token')===null"), true); fixture.reset();
  });

  for (const role of ['IT', 'ADMIN']) {
    setRole(role); fixture.reset(); await login(); await nav('Kho kiến thức'); await waitRows(3);
    await check(role + ' all status badges, combined filters and retained search', async () => {
      assert.equal(await hasButton('Tạo bài viết'), true);
      for (const status of ['DRAFT', 'PUBLISHED', 'ARCHIVED']) {
        await select(status); await waitRows(1);
        assert.equal(await evaluate(`!!document.querySelector('.kb-list .ui-badge--kb-${status}')`), true);
      }
      await fill('#kb-search', 'máy in'); await waitRows(0); await select('DRAFT'); await waitRows(1); await open(9); await back();
      assert.equal(await evaluate("document.querySelector('#kb-search').value"), 'máy in');
      await button('Xóa bộ lọc'); await waitRows(3); if (role === 'IT') await screenshot('01-kb-list-desktop');
    });
    await check(role + ' keyboard open/back focus, text safety and article metadata', async () => {
      await evaluate("document.querySelector('[data-open-article=\"8\"]').focus()");
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await waitFor('.kb-content'); await readExact(8); await settled();
      await until(() => evaluate("document.activeElement.matches('.knowledge-heading h2')"), 'Article heading focus missing');
      assert.equal(await evaluate("document.querySelectorAll('.kb-meta-details dt').length"), 4);
      if (role === 'IT') await screenshot('02-kb-detail-desktop');
      await back(); await until(() => evaluate("document.activeElement.dataset.openArticle==='8'"), 'Return focus missing');
    });
    await check(role + ' create validation and API failure retain form contents', async () => {
      await button('Tạo bài viết'); await waitFor('.kb-form'); const count = writes().length;
      await fill('#kb-title', '   '); await fill('#kb-content', '\n '); await button('Lưu bài viết');
      await waitFor('#kb-title-error'); await waitFor('#kb-content-error');
      await until(() => evaluate("document.activeElement.id==='kb-title'"), 'Validation focus missing'); assert.equal(writes().length, count);
      await fill('#kb-title', '😀'.repeat(256)); await fill('#kb-content', 'Nội dung giả lập'); await button('Lưu bài viết'); await waitFor('#kb-title-error'); assert.equal(writes().length, count);
      await fill('#kb-title', '  Hướng dẫn mới (giả lập)  '); await fill('#kb-content', '  Bước 1.\n\nBước 2.  ');
      for (const status of [400, 403, 404, 413, 500]) {
        fixture.writeStatus = status; await button('Lưu bài viết'); await waitFor('.knowledge > [role="alert"]'); await settled();
        assert.equal(await evaluate("document.querySelector('#kb-title').value"), '  Hướng dẫn mới (giả lập)  ');
        assert.equal(await evaluate("document.querySelector('#kb-content').value"), '  Bước 1.\n\nBước 2.  ');
      }
      fixture.writeStatus = 200; fixture.waitWrite = 400; const before = writes().length;
      await button('Lưu bài viết'); await button('Lưu bài viết'); await waitFor('.kb-content'); await settled();
      assert.equal(writes().length, before + 1); assert.equal(writes().at(-1).method, 'POST');
      assert.deepEqual(writes().at(-1).input, { title: 'Hướng dẫn mới (giả lập)', content: 'Bước 1.\n\nBước 2.' });
      await statusIs('DRAFT'); fixture.waitWrite = 0;
    });
    await check(role + ' edit draft and confirm discard without losing input on cancel', async () => {
      await button('Sửa bài'); await waitFor('.kb-form'); await fill('#kb-title', 'Bài đã sửa');
      const count = writes().length; await button('Hủy'); await dialog(); await cancel();
      assert.equal(await evaluate("document.querySelector('#kb-title').value"), 'Bài đã sửa'); assert.equal(writes().length, count);
      await button('Lưu bài viết'); await waitFor('.kb-content'); await settled();
      assert.equal(writes().at(-1).method, 'PUT'); assert.deepEqual(Object.keys(writes().at(-1).input).sort(), ['content', 'title']); await statusIs('DRAFT');
    });
    await check(role + ' status confirmation, Escape, focus containment and supported cycle', async () => {
      const count = writes().length;
      await evaluate("Array.from(document.querySelectorAll('.knowledge button')).find(b=>b.textContent==='Xuất bản').focus()");
      await button('Xuất bản'); await dialog();
      assert.equal(await evaluate("document.activeElement.matches('.ui-confirm-dialog .ui-button--secondary')"), true, 'Confirmation must initially focus cancel');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', modifiers: 8, windowsVirtualKeyCode: 9 });
      assert.equal(await evaluate("!!document.activeElement.closest('.ui-confirm-dialog')"), true, 'Shift+Tab must remain inside confirmation');
      await escape(); await until(() => evaluate("!document.querySelector('dialog[open]')"), 'Escape did not close dialog');
      assert.equal(writes().length, count);
      await until(() => evaluate("document.activeElement.textContent==='Xuất bản'"), 'Dialog return focus missing');
      for (const [label, status] of [['Xuất bản', 'PUBLISHED'], ['Lưu trữ', 'ARCHIVED'], ['Chuyển về bản nháp', 'DRAFT']]) {
        const before = writes().length; await button(label); await dialog(); assert.equal(writes().length, before);
        await confirm(); await statusIs(status); await settled(); assert.deepEqual(writes().at(-1).input, { status });
      }
    });
    await check(role + ' published edit requires confirmation; failed save retains text', async () => {
      await back(); await open(8); await button('Sửa bài'); await fill('#kb-content', 'Nội dung cập nhật giả lập.\nDòng thứ hai.');
      const count = writes().length; await button('Lưu bài viết'); await dialog(); await cancel(); assert.equal(writes().length, count);
      fixture.writeStatus = 500; await button('Lưu bài viết'); await confirm(); await waitFor('.knowledge > [role="alert"]'); await settled();
      assert.equal(await evaluate("document.querySelector('#kb-content').value"), 'Nội dung cập nhật giả lập.\nDòng thứ hai.');
      fixture.writeStatus = 200; await button('Lưu bài viết'); await confirm(); await waitFor('.kb-content'); await settled(); await statusIs('PUBLISHED'); await readExact(8);
      await back(); await open(10); await button('Sửa bài'); await fill('#kb-title', 'Bài lưu trữ đã sửa'); await button('Lưu bài viết'); await waitFor('.kb-content'); await settled(); await statusIs('ARCHIVED');
    });
    await logout();
  }

  setRole('IT'); fixture.reset(); await login(); await nav('Kho kiến thức'); await waitRows(3);
  await check('Unicode code-point and UTF-8 JSON 16 KB boundaries', async () => {
    await button('Tạo bài viết'); await fill('#kb-title', '😀'.repeat(255)); await fill('#kb-content', 'Nội dung hợp lệ.');
    await button('Lưu bài viết'); await waitFor('.kb-content'); await settled(); assert.equal([...writes().at(-1).input.title].length, 255);
    await back(); await button('Tạo bài viết'); await fill('#kb-title', 'x');
    const max = 16384 - Buffer.byteLength(JSON.stringify({ title: 'x', content: '' })); const count = writes().length;
    await fill('#kb-content', 'a'.repeat(max + 1)); await button('Lưu bài viết'); await waitFor('#kb-content-error'); assert.equal(writes().length, count);
    await fill('#kb-content', 'ế'.repeat(6000)); await button('Lưu bài viết'); await waitFor('#kb-content-error'); assert.equal(writes().length, count);
    await fill('#kb-content', 'a'.repeat(max)); await button('Lưu bài viết'); await waitFor('.kb-content'); await settled(); assert.equal(Buffer.byteLength(JSON.stringify(writes().at(-1).input)), 16384);
    fixture.reset(); await back(); await refresh(); await waitRows(3);
  });
  await check('List errors, retry, empty dataset and inaccessible detail', async () => {
    fixture.listStatus = 503; await refresh(); await waitFor('.knowledge .empty-state');
    assert.equal(await evaluate("document.querySelector('.empty-state h2').textContent"), 'Chưa thể tải kho kiến thức');
    fixture.listStatus = 200; await button('Thử lại'); await waitRows(3);
    fixture.rows = []; await refresh(); await waitFor('.knowledge .empty-state'); assert.equal(await evaluate("document.querySelector('.empty-state h2').textContent"), 'Chưa có bài viết');
    fixture.reset(); await refresh(); await waitRows(3);
    for (const status of [403, 404]) {
      fixture.detailStatus = status; await click('[data-open-article="8"]'); await waitFor('.knowledge > [role="alert"]'); await settled();
      assert.equal(await evaluate("!!document.querySelector('.kb-content')"), false);
    }
    fixture.detailStatus = 200;
  });
  await check('Failed status change keeps server-confirmed status and offers retry', async () => {
    await open(9); fixture.writeStatus = 400; await button('Xuất bản'); await confirm(); await waitFor('.knowledge > [role="alert"]'); await settled(); await statusIs('DRAFT');
    fixture.writeStatus = 200; await button('Xuất bản'); await confirm(); await statusIs('PUBLISHED'); await settled(); await back();
  });
  await check('Create after list failure clears stale error state when refresh succeeds', async () => {
    fixture.listStatus = 503; await refresh(); await waitFor('.knowledge .empty-state');
    await button('Tạo bài viết'); await fill('#kb-title', 'Bài viết khôi phục danh sách'); await fill('#kb-content', 'Nội dung giả lập.');
    fixture.listStatus = 200; await button('Lưu bài viết'); await waitFor('.kb-content'); await settled();
    await back(); await waitRows(4); fixture.reset(); await refresh(); await waitRows(3);
  });
  await check('Successful write with failed refresh shows saved state and prevents duplicate creation', async () => {
    await button('Tạo bài viết'); await fill('#kb-title', 'Đã lưu, chưa tải lại'); await fill('#kb-content', 'Nội dung giả lập'); fixture.failRefresh = true;
    const count = writes().length; await button('Lưu bài viết'); await waitFor('.kb-content'); await settled(); await waitFor('.knowledge > [role="alert"]');
    assert.equal(writes().length, count + 1); assert.equal(await hasButton('Lưu bài viết'), false); await statusIs('DRAFT');
    fixture.failRefresh = false; fixture.detailStatus = 200; fixture.listStatus = 200; await button('Làm mới chi tiết'); await settled();
    fixture.reset(); await back(); await refresh(); await waitRows(3);
  });
  await check('Mobile list/detail/form/confirmation at 390px and 320px', async () => {
    for (const width of [390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 844, mobile: true, deviceScaleFactor: 1 }); await noOverflow();
      if (width === 390) await screenshot('03-kb-list-mobile');
      await open(8); await noOverflow(); await readExact(8); if (width === 390) await screenshot('04-kb-detail-mobile');
      await button('Lưu trữ'); await dialog(); await noOverflow();
      assert.equal(await evaluate("document.querySelector('dialog').getBoundingClientRect().width <= window.innerWidth"), true);
      if (width === 390) await screenshot('05-kb-confirm-mobile'); await cancel();
      await button('Sửa bài'); await waitFor('.kb-form'); await fill('#kb-title', ''); await button('Lưu bài viết'); await waitFor('#kb-title-error'); await noOverflow();
      if (width === 390) await screenshot('06-kb-form-mobile');
      await button('Hủy'); await confirm(); await waitFor('.kb-content'); await back();
    }
  });
  await check('Role downgrade removes management form and restricted articles', async () => {
    await open(9); await button('Sửa bài'); await waitFor('.kb-form'); setRole('EMPLOYEE'); await evaluate("window.dispatchEvent(new Event('focus'))");
    await waitFor('#kb-search'); await waitRows(1);
    assert.equal(await evaluate("!!document.querySelector('#kb-status-filter') || !!document.querySelector('.kb-form')"), false); assert.equal(await hasButton('Tạo bài viết'), false);
  });
}
