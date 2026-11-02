// Isolated browser fixtures: no live backend, model, credentials or clipboard.
export function createRagFixture(user) {
  const fixture = { mode: 'answer', status: 200, code: '', wait: 0, listStatus: 200, detailStatus: 200, calls: [] };
  fixture.answer = '1. Kiểm tra kết nối (giả lập).\n2. Thử lại.\n\n<img src=x onerror="window.__unsafeRag=true">\n<script>window.__unsafeRag=true</script>';
  fixture.article = { id: 8, code: 'KB-000008', title: 'Hướng dẫn Wi-Fi giả lập', content: 'Nội dung KB giả lập.\n<img src=x onerror="window.__unsafeRag=true">', status: 'PUBLISHED', creator_name: 'Người soạn giả lập', updater_name: null, created_at: '2026-11-02T08:00:00Z', updated_at: '2026-11-02T08:00:00Z' };
  fixture.reset = () => Object.assign(fixture, { mode: 'answer', status: 200, code: '', wait: 0, listStatus: 200, detailStatus: 200 });
  fixture.handle = async (route, request) => {
    const input = request.postData ? JSON.parse(request.postData) : undefined;
    fixture.calls.push({ route, method: request.method, input });
    if (route === '/rag/ask' && request.method === 'POST') {
      if (Object.keys(input).join(',') !== 'question' || typeof input.question !== 'string' || !input.question.trim() || [...input.question].length > 1000) throw new Error('Invalid RAG request contract');
      const { mode, status, code, wait } = fixture;
      if (mode === 'hold') return { hold: true };
      if (mode === 'network') return { networkError: true };
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      if (status !== 200) return { status, body: { code, message: 'Lỗi giả lập không đưa thẳng vào giao diện.' } };
      if (mode === 'malformed') return { status: 200, body: { answered: true, answer: 'Sai schema giả lập', sources: [] } };
      return { status: 200, body: mode === 'fallback' ? { answered: false, answer: 'Chưa đủ thông tin trong Kho kiến thức (giả lập).', sources: [] } : { answered: true, answer: fixture.answer, sources: [
        { code: 'KB-000008', title: fixture.article.title },
        { code: 'KB-999999', title: 'Nguồn không có trong danh sách được phép xem' },
      ] } };
    }
    if (route === '/knowledge' && request.method === 'GET') {
      return { status: fixture.listStatus, body: fixture.listStatus === 200 ? { articles: [fixture.article] } : { message: 'Danh sách giả lập không khả dụng' } };
    }
    if (route === '/knowledge/8' && request.method === 'GET') {
      return { status: fixture.detailStatus, body: fixture.detailStatus === 200 ? { article: fixture.article } : { message: 'Bài viết giả lập không khả dụng' } };
    }
    throw new Error('Unsupported fixture request');
  };
  return fixture;
}

export async function runRagChecks(ctx) {
  const { assert, check, evaluate, waitFor, until, click, fill, nav, login, send, noOverflow, screenshot, fixture, ticketFixture, setRole } = ctx;
  const requests = () => fixture.calls.filter(call => call.route === '/rag/ask');
  const ticketWrites = () => ticketFixture.calls.filter(call => call.method === 'POST');
  const last = '.rag-turn:last-child';
  const settled = () => until(() => evaluate("!document.querySelector('.rag-turn[data-turn-status=\"pending\"]') && !document.querySelector('.rag-form button').disabled"), 'RAG request pending');
  const statusIs = status => until(() => evaluate(`document.querySelector('.rag-turn:last-child')?.dataset.turnStatus===${JSON.stringify(status)}`), 'Unexpected RAG turn status: ' + status);
  const ask = async question => { await fill('#rag-question', question); await click('.rag-form button'); };
  const reopen = async () => { await nav('Tổng quan'); await nav('Trợ lý AI'); await waitFor('#rag-question'); };
  const escape = () => send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  const button = text => evaluate(`Array.from(document.querySelectorAll('main button')).find(b=>b.textContent.trim()===${JSON.stringify(text)})?.click()`);
  const logout = async () => { await click('[aria-label="Đăng xuất"]'); await waitFor('.login-page'); };

  // Interpose browser timers only for the existing 65000ms RAG deadline.
  // The production source and timeout value are not changed for this test.
  await evaluate(`(() => {
    const original = window.setTimeout.bind(window);
    window.__ragDeadlines=[]; window.__fastRagTimeout=false;
    window.setTimeout=(fn,ms,...args)=>{ if(ms===65000) window.__ragDeadlines.push(ms); return original(fn,ms===65000 && window.__fastRagTimeout?100:ms,...args); };
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{ if(window.__copyFailure) throw new Error('Mock clipboard denied'); window.__copiedAnswer=text; }}});
  })()`);
  await login(); await nav('Trợ lý AI'); await waitFor('#rag-question');
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await check('Suggestions fill only; payload is question-only and duplicate submit is blocked', async () => {
    await screenshot('00-rag-welcome-desktop');
    assert.equal(await evaluate("document.querySelectorAll('.rag-suggestions button').length"), 4);
    for (let index = 0; index < 4; index++) {
      await click(`.rag-suggestions button:nth-child(${index + 1})`);
      assert.equal(await evaluate("document.activeElement.id"), 'rag-question');
    }
    assert.equal(requests().length, 0);
    await click('.rag-suggestions button'); fixture.wait = 600;
    const question = await evaluate("document.querySelector('#rag-question').value");
    await click('.rag-form button'); await statusIs('pending');
    await evaluate("document.querySelector('.rag-form').requestSubmit(); document.querySelector('.rag-form').requestSubmit()");
    assert.equal(await evaluate("document.querySelector('#rag-question').disabled"), true);
    await statusIs('answered'); await settled(); fixture.wait = 0;
    assert.equal(requests().length, 1); assert.deepEqual(requests()[0].input, { question });
    assert.equal(await evaluate("document.querySelector('.rag-answer').textContent"), fixture.answer);
    assert.equal(await evaluate("document.querySelector('.rag-answer').children.length"), 0);
    assert.equal(await evaluate('Boolean(window.__unsafeRag)'), false);
    await screenshot('01-rag-answer-desktop');
  });
  await check('Known KB code opens read-only source; unknown code stays plain text', async () => {
    await waitFor('[data-source-code="KB-000008"]');
    assert.equal(await evaluate("document.querySelectorAll('.rag-sources button').length"), 1);
    assert.equal(await evaluate("document.querySelectorAll('.rag-sources a').length"), 0);
    await evaluate("document.querySelector('[data-source-code=\"KB-000008\"]').focus()");
    await click('[data-source-code="KB-000008"]'); await waitFor('.rag-source-dialog[open] .kb-content');
    assert.equal(await evaluate("document.querySelector('.rag-source-dialog .kb-content').textContent"), fixture.article.content);
    assert.equal(await evaluate("document.querySelector('.rag-source-dialog .kb-content').children.length"), 0);
    assert.equal(await evaluate("!!document.querySelector('.rag-source-dialog .knowledge-management')"), false);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', modifiers: 8, windowsVirtualKeyCode: 9 });
    assert.equal(await evaluate("!!document.activeElement.closest('.rag-source-dialog')"), true);
    await screenshot('02-rag-source-desktop'); await escape();
    await until(() => evaluate("!document.querySelector('.rag-source-dialog')"), 'Source reader did not close');
    assert.equal(await evaluate("document.activeElement.dataset.sourceCode"), 'KB-000008');
  });
  await check('Copy success and denied clipboard are announced without real clipboard access', async () => {
    await click('.rag-copy'); await until(() => evaluate("document.querySelector('.rag-copy-status').textContent.includes('Đã sao chép')"), 'Copy success missing');
    assert.equal(await evaluate('window.__copiedAnswer'), fixture.answer);
    await evaluate('window.__copyFailure=true'); await click('.rag-copy');
    await until(() => evaluate("document.querySelector('.rag-copy-status').textContent.includes('Không thể sao chép')"), 'Copy failure missing');
    await evaluate('window.__copyFailure=false');
  });
  await check('Multiple turns retained but each request independent; Unicode limit and keyboard', async () => {
    const before = requests().length;
    await fill('#rag-question', '😀'.repeat(1001)); assert.equal(await evaluate("document.querySelector('.rag-form button').disabled"), true);
    await evaluate("document.querySelector('.rag-form').requestSubmit()"); assert.equal(requests().length, before);
    await fill('#rag-question', '   '); assert.equal(await evaluate("document.querySelector('.rag-form button').disabled"), true);
    await fill('#rag-question', 'Câu hỏi thứ hai'); await evaluate("document.querySelector('#rag-question').focus()");
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', modifiers: 8, text: '\r', windowsVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    assert.equal(requests().length, before);
    await evaluate("document.querySelector('#rag-question').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}))"); assert.equal(requests().length, before);
    await fill('#rag-question', '😀'.repeat(1000));
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await until(() => evaluate("document.querySelectorAll('.rag-turn').length===2"), 'Second turn missing'); await settled();
    assert.deepEqual(requests().at(-1).input, { question: '😀'.repeat(1000) });
    assert.equal(await evaluate("document.querySelectorAll('.rag-answer').length"), 2);
    assert.deepEqual(await evaluate('Object.keys(sessionStorage)'), ['it_support_token']); assert.equal(await evaluate('localStorage.length'), 0);
  });
  await check('Fallback opens prefilled Ticket form, no POST until explicit user submit', async () => {
    fixture.mode = 'fallback'; const question = 'Câu hỏi chưa có hướng dẫn\nCần bộ phận IT hỗ trợ.';
    await ask(question); await statusIs('fallback'); await settled(); const count = ticketWrites().length;
    await click(`${last} .rag-ticket-cta`); await waitFor('.ticket-form');
    assert.equal(ticketWrites().length, count);
    assert.equal(await evaluate("document.querySelector('#ticket-description').value"), question);
    assert.equal(await evaluate("document.querySelector('#ticket-title').value"), 'Yêu cầu hỗ trợ từ Trợ lý AI');
    await screenshot('03-rag-ticket-prefill');
    await fill('#ticket-title', 'Tiêu đề đã kiểm tra'); await fill('#ticket-description', question + '\nBổ sung thông tin.');
    await button('Gửi yêu cầu'); await waitFor('.ticket-detail');
    assert.equal(ticketWrites().length, count + 1);
    assert.deepEqual(ticketWrites().at(-1).input, { title: 'Tiêu đề đã kiểm tra', description: question + '\nBổ sung thông tin.' });
    await nav('Trợ lý AI'); await waitFor('.rag-welcome'); assert.equal(await evaluate("document.querySelectorAll('.rag-turn').length"), 0);
    fixture.reset();
  });
  await check('Cancelling Ticket prefill leaves no write and next manual form is empty', async () => {
    fixture.mode = 'fallback'; await ask('Một câu hỏi khác'); await statusIs('fallback'); await settled();
    const count = ticketWrites().length; await click('.rag-ticket-cta'); await waitFor('.ticket-form'); await button('Hủy'); await waitFor('#ticket-search');
    await button('Tạo yêu cầu'); await waitFor('.ticket-form');
    assert.equal(await evaluate("document.querySelector('#ticket-description').value"), ''); assert.equal(ticketWrites().length, count);
    await nav('Trợ lý AI'); await waitFor('#rag-question'); fixture.reset();
  });
  await check('Network failure, HTTP timeout, provider failures and malformed response stay in their turns', async () => {
    const cases = [
      { mode: 'network', text: 'Không kết nối được' },
      { status: 504, text: 'quá nhiều thời gian' },
      { status: 503, code: 'OLLAMA_UNAVAILABLE', text: 'Không kết nối được Ollama' },
      { status: 502, code: 'OLLAMA_INVALID_OUTPUT', text: 'Chưa xác minh' },
      { status: 429, text: 'đang bận' },
      { status: 403, text: 'không có quyền' },
      { mode: 'malformed', text: 'dữ liệu chưa hợp lệ' },
    ];
    for (const options of cases) {
      fixture.reset(); Object.assign(fixture, options); await ask('Kiểm tra lỗi giả lập'); await statusIs('error'); await settled();
      assert.equal(await evaluate(`document.querySelector('${last} [role="alert"]').textContent.includes(${JSON.stringify(options.text)})`), true);
      assert.equal(await evaluate(`!!document.querySelector('${last} .rag-ticket-cta')`), false);
    }
    const before = requests().length; await click(`${last} button`); assert.equal(requests().length, before);
    assert.equal(await evaluate("document.activeElement.id"), 'rag-question');
    fixture.reset(); await ask('Thử lại chủ động'); await statusIs('answered'); await settled();
    assert.equal(await evaluate("document.querySelectorAll('.rag-turn').length"), cases.length + 1);
  });
  await check('Existing 65000ms deadline aborts a stalled request and unlocks next submit', async () => {
    fixture.mode = 'hold'; await evaluate('window.__fastRagTimeout=true'); await ask('Mô phỏng hết thời gian'); await statusIs('error'); await settled();
    assert.equal(await evaluate(`document.querySelector('${last} [role="alert"]').textContent.includes('quá nhiều thời gian')`), true);
    assert.equal(await evaluate('window.__ragDeadlines.at(-1)'), 65000);
    await evaluate('window.__fastRagTimeout=false'); fixture.reset(); await ask('Sau timeout'); await statusIs('answered'); await settled();
  });
  await check('Unmount aborts pending question; history does not leak into a new screen session', async () => {
    fixture.mode = 'hold'; await ask('Đang hỏi thì rời màn hình'); await statusIs('pending'); await nav('Tổng quan'); fixture.reset();
    await nav('Trợ lý AI'); await waitFor('.rag-welcome'); assert.equal(await evaluate("document.querySelectorAll('.rag-turn').length"), 0);
    await ask('Phiên mới'); await statusIs('answered'); await settled();
    assert.equal(await evaluate("document.querySelectorAll('.rag-turn').length"), 1);
  });
  await check('Source lookup failure retains answer and plain source text', async () => {
    fixture.listStatus = 503; await reopen(); await ask('Không tải được danh sách KB'); await statusIs('answered'); await settled();
    assert.equal(await evaluate("document.querySelectorAll('.rag-sources button').length"), 0);
    assert.equal(await evaluate("document.querySelector('.rag-answer').textContent"), fixture.answer); fixture.reset();
  });
  await check('Source 403/404 removes unusable opener, keeps conversation and shows safe error', async () => {
    for (const status of [403, 404]) {
      fixture.reset(); await reopen(); await ask('Xem nguồn'); await statusIs('answered'); await waitFor('[data-source-code="KB-000008"]');
      fixture.detailStatus = status; await click('[data-source-code="KB-000008"]'); await waitFor('.rag-source-dialog [role="alert"]');
      assert.equal(await evaluate("!!document.querySelector('.rag-source-dialog .kb-content')"), false); await escape();
      await until(() => evaluate("!document.querySelector('.rag-source-dialog')"), 'Reader still open');
      assert.equal(await evaluate("document.querySelectorAll('.rag-sources button').length"), 0);
      assert.equal(await evaluate("document.querySelector('.rag-answer').textContent"), fixture.answer);
    }
    fixture.reset();
  });
  await check('RAG 401 preserves global session logout', async () => {
    fixture.status = 401; await ask('Phiên hết hạn'); await waitFor('.login-page');
    assert.equal(await evaluate("sessionStorage.getItem('it_support_token')===null"), true); fixture.reset();
  });
  for (const role of ['IT', 'ADMIN']) {
    setRole(role); await login(); await nav('Trợ lý AI'); await waitFor('#rag-question');
    await check(role + ' can ask and read sources; fallback has no Ticket creation action', async () => {
      fixture.reset(); await ask('Câu hỏi theo quyền'); await statusIs('answered'); await waitFor('[data-source-code="KB-000008"]');
      await click('[data-source-code="KB-000008"]'); await waitFor('.rag-source-dialog .kb-content');
      assert.equal(await evaluate("!!document.querySelector('.rag-source-dialog .knowledge-management')"), false); await escape();
      fixture.mode = 'fallback'; await ask('Câu hỏi thiếu căn cứ'); await statusIs('fallback'); await settled();
      assert.equal(await evaluate("!!document.querySelector('.rag-ticket-cta')"), false);
    });
    if (role === 'IT') await logout();
  }
  await check('Role change resets conversation and permitted source index', async () => {
    setRole('EMPLOYEE'); await evaluate("window.dispatchEvent(new Event('focus'))"); await waitFor('.rag-welcome');
    assert.equal(await evaluate("document.querySelectorAll('.rag-turn').length"), 0);
  });
  await check('Responsive chat, long text, source reader, fallback and errors at 390/320px', async () => {
    for (const width of [390, 320]) {
      fixture.reset(); await send('Emulation.setDeviceMetricsOverride', { width, height: 844, mobile: true, deviceScaleFactor: 1 });
      await noOverflow(); if (width === 390) await screenshot('04-rag-welcome-mobile');
      await ask('Nội dung dài: ' + 'x'.repeat(500)); await statusIs('answered'); await settled(); await waitFor('[data-source-code="KB-000008"]'); await noOverflow();
      if (width === 390) await screenshot('05-rag-answer-mobile');
      await click('[data-source-code="KB-000008"]'); await waitFor('.rag-source-dialog .kb-content'); await noOverflow();
      assert.equal(await evaluate("document.querySelector('.rag-source-dialog').scrollWidth <= document.querySelector('.rag-source-dialog').clientWidth"), true);
      await escape(); fixture.mode = 'fallback'; await ask('Không có tài liệu phù hợp'); await statusIs('fallback'); await settled(); await noOverflow();
      if (width === 390) await screenshot('06-rag-fallback-mobile');
      fixture.mode = 'network'; await ask('Kiểm tra lỗi trên mobile'); await statusIs('error'); await settled(); await noOverflow();
    }
    assert.deepEqual(await evaluate('Object.keys(sessionStorage)'), ['it_support_token']); assert.equal(await evaluate('localStorage.length'), 0);
  });
}
