// GĐ6.3: mặc định chỉ logic/mock, không cần .env, MySQL hoặc Gemini thật.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const historical = JSON.parse(read('docs/stage5-4-results.json')).questions;
const { normalizeOutput } = require('../src/rag/generationOutput');
const { buildPrompt } = require('../src/rag/generationPrompt');
const tests = [];
async function check(name, work) {
  const t = { name, status: 'NOT RUN' }; tests.push(t);
  try { const value = await work(); t.status = 'PASS'; if (value) t.observed = value; }
  catch (e) { t.status = 'FAIL'; t.errorType = e.name; process.exitCode = 1; }
}
function replay(q) {
  return q.trace.rawGeneration || JSON.stringify({ answered: q.response.answered, answer: q.response.answer, evidence: q.trace.evidence.map(e => e.quote) });
}
function loadUserModel(db) {
  const m = { exports: {} };
  vm.runInThisContext('(function(require,module,exports){' + read('backend/src/models/userModel.js') + '\n})')(
    key => { assert.equal(key, '../config/db'); return db; }, m, m.exports);
  return m.exports;
}
function memoryPool(initial) {
  let rows = structuredClone(initial), tail = Promise.resolve();
  const calls = [];
  async function execute(sql, args = []) {
    calls.push(sql);
    if (/^SELECT/.test(sql)) return [structuredClone(/WHERE id = \?/.test(sql) ? rows.filter(x => x.id === args[0]) : rows)];
    const field = /SET (role|status) =/.exec(sql)?.[1]; assert.ok(field);
    const row = rows.find(x => x.id === args[1]); if (row) row[field] = args[0];
    return [{ affectedRows: row ? 1 : 0 }];
  }
  return { execute, calls, rows: () => structuredClone(rows), async getConnection() {
    let release, before;
    return { execute, async beginTransaction() { const previous = tail; tail = new Promise(r => { release = r; }); await previous; before = structuredClone(rows); },
      async commit() {}, async rollback() { rows = before; }, release() { release(); } };
  } };
}
async function reproduce() {
  const result = { phase: 'PRE_FIX', baseline: '7aad0fe91aa515dd3d3c3cbf9c22466b7d2818dc', testedAt: new Date().toISOString(), gemini_real_requests: 0, cases: [] };
  for (const id of ['B01', 'C03', 'A03', 'C01']) {
    const q = historical.find(x => x.id === id);
    try { normalizeOutput(replay(q), q.trace.context); result.cases.push({ id, accepted: true, historicalEvaluation: q.manualEvaluation }); }
    catch (e) { result.cases.push({ id, accepted: false, code: e.code, quoteLengths: JSON.parse(replay(q)).evidence.map(x => x.length) }); }
  }
  for (const [method, value] of [['updateRole', 'EMPLOYEE'], ['updateStatus', 'INACTIVE']]) {
    const db = memoryPool([{ id: 1, role: 'ADMIN', status: 'ACTIVE' }]);
    await loadUserModel(db)[method](1, value);
    result.cases.push({ id: 'P2-04-' + method, activeAdmins: db.rows().filter(x => x.role === 'ADMIN' && x.status === 'ACTIVE').length, mode: 'MODEL_MEMORY_NO_DB' });
  }
  result.unicode = { htmlMaxLength255: read('frontend/src/KnowledgeBase.jsx').includes('maxLength={255}'), backendCountsCodePoints: read('backend/src/controllers/knowledgeArticleController.js').includes('[...title].length'), sampleUtf16: '😀'.repeat(255).length, sampleCodePoints: [...'😀'.repeat(255)].length };
  result.reproducibility = { backendLock: fs.existsSync(path.join(root, 'backend/package-lock.json')), frontendLock: fs.existsSync(path.join(root, 'frontend/package-lock.json')), scriptMissing: !JSON.parse(read('backend/package.json')).scripts['test:stage6-3'], browserTempDependency: read('backend/tests/stage6-2-e2e.cjs').includes('it-support-browser-check'), cleanMachine: 'NOT VERIFIED ON CLEAN MACHINE' };
  assert.deepEqual(result.cases.slice(0,4).map(x=>x.accepted), [true,true,false,false]);
  assert.ok(result.cases.slice(4).every(x=>x.activeAdmins===0));
  assert.ok(result.unicode.htmlMaxLength255 && result.unicode.backendCountsCodePoints);
  const out = path.join(root, 'backend/.cache/stage6-3-before.json'); fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
async function runLogic() {
  for (const id of ['B01', 'C03']) await check('P2-01 prompt và fixture an toàn ' + id, () => {
    const q = historical.find(x => x.id === id), prompt = buildPrompt(q.question, q.trace.context);
    assert.ok(prompt.systemInstruction.includes('khả năng thành nguyên nhân chắc chắn'));
    assert.ok(prompt.systemInstruction.includes('tên ứng dụng/trang hoặc loại tài nguyên'));
    assert.ok(prompt.systemInstruction.includes('có thể'));
    assert.equal(JSON.parse(prompt.contents[0].parts[0].text).QUESTION, q.question);
    // Fixture mô phỏng phản hồi tuân thủ instruction, không phải kết quả model thật.
    const answer = id === 'B01'
      ? 'Chưa đủ căn cứ kết luận nguyên nhân. Bạn có thể kiểm tra Wi-Fi đã bật và chế độ máy bay đã tắt.'
      : 'Bạn đang đăng nhập trang nào và gặp thông báo lỗi gì? Nếu đây là website nội bộ, hãy xác nhận địa chỉ từ nguồn đáng tin cậy.';
    const r = normalizeOutput(JSON.stringify({ answered: true, answer, evidence: [q.trace.evidence[0].quote] }), q.trace.context);
    assert.equal(r.response.answer, answer); assert.ok(r.response.sources.length);
    const old = normalizeOutput(replay(q), q.trace.context);
    assert.equal(old.response.answer, q.response.answer);
    return { historicalOutputStillAccepted: true, limitation: 'Prompt mitigation; chưa chứng minh hành vi Gemini thật hay semantic validator.' };
  });
  for (const id of ['A03','C01']) await check('P2-02 phát lại evidence dài ' + id, () => {
    const q = historical.find(x => x.id === id), r = normalizeOutput(replay(q), q.trace.context);
    const full = JSON.parse(replay(q));
    assert.equal(r.response.answer, full.answer);
    assert.ok(r.evidence.every(x=>x.quote.length<=500 && q.trace.context.some(c=>c.text.includes(x.quote))));
    const codes = q.trace.context.filter(c=>full.evidence.some(e=>c.text.includes(e))).map(c=>c.code);
    assert.deepEqual(r.response.sources.map(x=>x.code), codes);
    return { accepted: true, fullLengths: full.evidence.map(x=>x.length), excerptLengths: r.evidence.map(x=>x.quote.length), sources: codes, semanticQuality: id==='C01'?'Câu hỏi mơ hồ vẫn là giới hạn P2-01':'Ứng viên lịch sử có căn cứ; đây là replay, không gọi model.' };
  });
  const quote='Hướng dẫn kiểm tra trong Kho kiến thức. '.repeat(30);
  const context=[{articleId:1,code:'KB-TEST',title:'Test',score:0.9,text:quote}];
  const raw=evidence=>JSON.stringify({answered:true,answer:'Hướng dẫn kiểm tra.',evidence});
  await check('P2-02 suffix bịa sau 500 vẫn bị chặn trước truncate',()=>assert.throws(()=>normalizeOutput(raw([quote+'NỘI DUNG BỊA']),context),e=>e.code==='GEMINI_INVALID_EVIDENCE'));
  await check('P2-02 nguồn sai, quote rỗng/ngắn, schema sai bị chặn',()=>{for(const e of [['Không thuộc nội dung bài viết được chọn.'],[' '],['ngắn'],[42],[],Array(9).fill(quote)])assert.throws(()=>normalizeOutput(raw(e),context));});
  await check('P2-02 excerpt không cắt đôi surrogate pair',()=>{
    const text='😀'.repeat(300); const r=normalizeOutput(raw([text]),[{...context[0],text}]);
    assert.ok(r.evidence[0].quote.length<=500);assert.ok(!/[\uD800-\uDBFF]$/.test(r.evidence[0].quote));
  });
  await check('P2-02 chuẩn hóa CRLF/NFC trước containment',()=>{
    const text='Kiểm tra kết nối và tài khoản.\nKhông chia sẻ mật khẩu.';
    assert.equal(normalizeOutput(raw([text.normalize('NFD').replace('\n','\r\n')]),[{...context[0],text}]).response.answered,true);
  });
  await check('P2-02 fallback giữ nguyên contract',()=>assert.equal(normalizeOutput(JSON.stringify({answered:false,answer:'Thiếu thông tin',evidence:[]}),context).response.answered,false));
  for(const [method,value] of [['updateRole','EMPLOYEE'],['updateRole','IT'],['updateStatus','INACTIVE']])await check('P2-04 chặn ADMIN cuối '+method+'/'+value,async()=>{
    const db=memoryPool([{id:1,role:'ADMIN',status:'ACTIVE'}]), model=loadUserModel(db);
    await assert.rejects(model[method](1,value),e=>e.code==='LAST_ACTIVE_ADMIN'&&e.status===409);
    assert.deepEqual(db.rows(),[{id:1,role:'ADMIN',status:'ACTIVE'}]);assert.ok(db.calls.some(x=>/FOR UPDATE/.test(x)));assert.ok(!db.calls.some(x=>/^UPDATE/.test(x)));
  });
  await check('P2-04 ADMIN INACTIVE khác không được tính',async()=>{
    const db=memoryPool([{id:1,role:'ADMIN',status:'ACTIVE'},{id:2,role:'ADMIN',status:'INACTIVE'}]);
    await assert.rejects(loadUserModel(db).updateRole(1,'IT'),e=>e.code==='LAST_ACTIVE_ADMIN');
  });
  await check('P2-04 có ADMIN ACTIVE khác, đổi role/status hợp lệ',async()=>{
    for(const [method,value] of [['updateRole','IT'],['updateStatus','INACTIVE']]){
      const db=memoryPool([{id:1,role:'ADMIN',status:'ACTIVE'},{id:2,role:'ADMIN',status:'ACTIVE'}]);
      assert.ok(await loadUserModel(db)[method](2,value));assert.equal(db.rows().filter(x=>x.role==='ADMIN'&&x.status==='ACTIVE').length,1);
    }
  });
  await check('P2-04 no-op, user thường và ID thiếu',async()=>{
    const db=memoryPool([{id:1,role:'ADMIN',status:'ACTIVE'},{id:2,role:'EMPLOYEE',status:'ACTIVE'}]),m=loadUserModel(db);
    assert.equal((await m.updateRole(1,'ADMIN')).role,'ADMIN');assert.equal((await m.updateStatus(1,'ACTIVE')).status,'ACTIVE');
    assert.equal((await m.updateStatus(2,'INACTIVE')).status,'INACTIVE');assert.equal(await m.updateRole(999,'IT'),undefined);
  });
  await check('P2-04 hai hạ quyền đồng thời giữ ít nhất một ADMIN (mock transaction)',async()=>{
    const db=memoryPool([{id:1,role:'ADMIN',status:'ACTIVE'},{id:2,role:'ADMIN',status:'ACTIVE'}]),m=loadUserModel(db);
    const r=await Promise.allSettled([m.updateRole(1,'IT'),m.updateStatus(2,'INACTIVE')]);
    assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(db.rows().filter(x=>x.role==='ADMIN'&&x.status==='ACTIVE').length,1);
  });
  await check('P2-03 npm script, lockfile và hướng dẫn có trong repo',()=>{
    const p=JSON.parse(read('backend/package.json'));assert.equal(p.scripts['test:stage6-3'],'node tests/stage6-3-fixes.cjs');
    for(const f of ['backend/package-lock.json','frontend/package-lock.json'])assert.ok(fs.existsSync(path.join(root,f)));
    return { cleanMachine:'NOT VERIFIED ON CLEAN MACHINE', mode:'LOGIC_NO_ENV_NO_MYSQL_NO_GEMINI' };
  });
  return tests;
}
module.exports={runLogic,loadUserModel,replay};
if(require.main===module){
  (process.argv.includes('--reproduce')?reproduce():runLogic().then(rows=>{
    const report={testedAt:new Date().toISOString(),mode:'LOGIC_MOCK',gemini_real_requests:0,tests:rows};
    if(process.argv.includes('--report')){const out=path.join(root,'backend/.cache/stage6-3-logic.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');}
    console.log(JSON.stringify(report,null,2));
  })).catch(e=>{console.error('STAGE63_FAILED '+e.name);process.exitCode=1;});
}
