const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = require('../src/app');
const pool = require('../src/config/db');
const results = [], ids = [];
let base, employee, it, admin, article, adminArticle, safeResponses = 0;
let before;
function safe(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert.ok(!/password|hash|secret|stack|sql/i.test(key), 'Response có trường nhạy cảm'); safe(item);
  }
}
async function request(route, expected, session, method = 'GET', body) {
  const response = await fetch(base + route, { method, headers: { ...(session ? { Authorization: `Bearer ${session.token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${route}: ${data.message || response.status}`);
  safe(data); safeResponses++; return data;
}
async function test(number, name, action) {
  try { await action(); results.push({ test: number, name, status: 'PASS' }); console.log(`PASS ${number}: ${name}`); }
  catch (error) { results.push({ test: number, name, status: 'FAIL', message: error.message }); throw error; }
}
async function create(session, title = 'Bài viết kiểm thử tạm') {
  const data = await request('/api/knowledge', 201, session, 'POST', { title, content: 'Nội dung kiểm thử, không phải dữ liệu seed.' });
  ids.push(data.article.id); return data.article;
}
const get = (id, session = it, expected = 200) => request(`/api/knowledge/${id}`, expected, session);
const status = (id, next, session = it, expected = 200) => request(`/api/knowledge/${id}/status`, expected, session, 'PATCH', { status: next });
const list = (session) => request('/api/knowledge', 200, session);
async function main() {
  assert.notEqual(process.env.NODE_ENV, 'production');
  const [[db]] = await pool.query('SELECT DATABASE() AS name'); assert.equal(db.name, 'it_support_rag');
  [before] = await pool.query('SELECT * FROM knowledge_articles ORDER BY id');
  const login = email => request('/api/auth/login', 200, null, 'POST', { email, password: process.env.SEED_USER_PASSWORD });
  employee = await login('employee@test.local'); it = await login('it@test.local'); admin = await login('admin@test.local');
  await test(1, 'Thiếu token -> 401 ở mọi endpoint', async () => {
    for (const [route, method] of [['/api/knowledge','GET'],['/api/knowledge/1','GET'],['/api/knowledge','POST'],['/api/knowledge/1','PUT'],['/api/knowledge/1/status','PATCH']]) await request(route, 401, null, method);
  });
  await test(2, 'EMPLOYEE không tạo bài -> 403', () => request('/api/knowledge', 403, employee, 'POST', { title:'Test',content:'Test' }));
  await test(3, 'IT tạo bài thành công', async () => { article = await create(it); });
  await test(4, 'Bài mới là DRAFT', async () => assert.equal(article.status, 'DRAFT'));
  await test(5, 'Code dạng KB-xxxxxx', async () => assert.match(article.code, /^KB-\d{6,}$/));
  await test(6, 'created_by đúng IT', async () => { assert.equal(article.created_by, it.user.id); assert.equal(article.updated_by, null); });
  await test(7, 'ADMIN tạo bài', async () => { adminArticle = await create(admin); assert.equal(adminArticle.created_by, admin.user.id); });
  await test(8, 'EMPLOYEE không thấy DRAFT trong danh sách', async () => { const data = await list(employee); assert.ok(data.articles.every(a => a.status === 'PUBLISHED')); assert.ok(!data.articles.some(a => a.id === article.id)); });
  await test(9, 'IT thấy DRAFT', async () => assert.ok((await list(it)).articles.some(a => a.id === article.id)));
  await test(10, 'ADMIN thấy DRAFT', async () => { assert.ok((await list(admin)).articles.some(a => a.id === article.id)); await get(article.id, admin); });
  await test(11, 'EMPLOYEE không xem trực tiếp DRAFT', () => get(article.id, employee, 403));
  await test(12, 'IT cập nhật title/content', async () => { const data = await request(`/api/knowledge/${article.id}`, 200, it, 'PUT', { title:'  Tiêu đề đã sửa  ',content:'  Nội dung đã sửa  ' }); assert.equal(data.article.title,'Tiêu đề đã sửa'); assert.equal(data.article.content,'Nội dung đã sửa'); assert.equal(data.article.code,article.code); assert.equal(data.article.status,'DRAFT'); });
  await test(13, 'updated_by đúng người cập nhật', async () => assert.equal((await get(article.id)).article.updated_by,it.user.id));
  await test(14, 'EMPLOYEE không được update hoặc đổi status', async () => { await request(`/api/knowledge/${article.id}`,403,employee,'PUT',{title:'Test',content:'Test'}); await status(article.id,'PUBLISHED',employee,403); });
  await test(15, 'DRAFT -> PUBLISHED', async () => assert.equal((await status(article.id,'PUBLISHED')).article.status,'PUBLISHED'));
  await test(16, 'EMPLOYEE thấy PUBLISHED', async () => assert.ok((await list(employee)).articles.some(a=>a.id===article.id)));
  await test(17, 'EMPLOYEE xem chi tiết PUBLISHED', async () => assert.equal((await get(article.id,employee)).article.status,'PUBLISHED'));
  await test(18, 'PUBLISHED -> ARCHIVED', async () => { const data=await status(article.id,'ARCHIVED',admin); assert.equal(data.article.status,'ARCHIVED'); assert.equal(data.article.updated_by,admin.user.id); });
  await test(19, 'EMPLOYEE không thấy ARCHIVED', async () => { assert.ok(!(await list(employee)).articles.some(a=>a.id===article.id)); await get(article.id,employee,403); for(const session of [it,admin]) { assert.ok((await list(session)).articles.some(a=>a.id===article.id)); await get(article.id,session); } });
  await test(20, 'ARCHIVED -> DRAFT', async () => assert.equal((await status(article.id,'DRAFT',admin)).article.status,'DRAFT'));
  await test(21, 'Chặn mọi transition không hợp lệ', async () => {
    await status(article.id,'DRAFT',it,400); await status(article.id,'ARCHIVED',it,400);
    await status(article.id,'PUBLISHED'); await status(article.id,'DRAFT',it,400); await status(article.id,'PUBLISHED',it,400);
    await status(article.id,'ARCHIVED'); await status(article.id,'ARCHIVED',it,400); await status(article.id,'PUBLISHED',it,400);
    await status(article.id,'DRAFT');
  });
  await test(22, 'Chặn title rỗng, sai kiểu hoặc quá dài', async () => { for(const title of ['', '   ', 123, 'a'.repeat(256)]) { await request('/api/knowledge',400,it,'POST',{title,content:'Test'}); await request(`/api/knowledge/${article.id}`,400,it,'PUT',{title,content:'Test'}); } });
  await test(23, 'Chặn content rỗng hoặc sai kiểu', async () => { for(const content of ['', ' \n ', 123, null]) { await request('/api/knowledge',400,it,'POST',{title:'Test',content}); await request(`/api/knowledge/${article.id}`,400,it,'PUT',{title:'Test',content}); } });
  await test(24, 'ID không tồn tại -> 404', async () => { await get(2147483647,it,404); await request('/api/knowledge/2147483647',404,admin,'PUT',{title:'Test',content:'Test'}); await status(2147483647,'PUBLISHED',admin,404); });
  await test(25, 'Mọi response không lộ password/hash/secret/stack/SQL', async () => assert.ok(safeResponses >= 25));
  await test('B1', 'Chặn trường chỉ server được quyết định', async () => {
    for(const key of ['id','code','status','created_by','updated_by','created_at','updated_at']) {
      const body={title:'Test',content:'Test',[key]:'fake'};
      await request('/api/knowledge',400,it,'POST',body); await request(`/api/knowledge/${article.id}`,400,admin,'PUT',body);
    }
    await request(`/api/knowledge/${article.id}/status`,400,admin,'PATCH',{status:'PUBLISHED',updated_by:employee.user.id});
  });
  await test('B2', 'ADMIN sửa bài, giữ code/creator, truy vấn tham số an toàn', async () => {
    const title="Kiểm thử ' OR 1=1 --";
    const data=await request(`/api/knowledge/${article.id}`,200,admin,'PUT',{title,content:'Nội dung cập nhật bởi ADMIN'});
    assert.equal(data.article.title,title); assert.equal(data.article.created_by,it.user.id); assert.equal(data.article.updated_by,admin.user.id); assert.equal(data.article.code,article.code);
  });
  await test('B3', 'ID/status/body không hợp lệ -> 400', async () => {
    for(const id of ['0','-1','abc','2147483648']) await get(id,it,400);
    await status(article.id,'INVALID',admin,400);
    for(const body of [[],{}, {title:'Test'}, {content:'Test'}]) await request('/api/knowledge',400,it,'POST',body);
  });
  await test('B4', 'Tạo đồng thời không trùng mã', async () => {
    const outcomes=await Promise.allSettled(Array.from({length:5},()=>create(it)));
    assert.ok(outcomes.every(r=>r.status==='fulfilled'));
    const articles=outcomes.map(r=>r.value); assert.equal(new Set(articles.map(a=>a.code)).size,5);
    for(const a of articles) assert.equal(a.code,`KB-${String(a.id).padStart(6,'0')}`);
  });
  await test('B5', 'Publish đồng thời chỉ một request hợp lệ', async () => {
    const send=()=>fetch(`${base}/api/knowledge/${adminArticle.id}/status`,{method:'PATCH',headers:{Authorization:`Bearer ${admin.token}`,'Content-Type':'application/json'},body:JSON.stringify({status:'PUBLISHED'})});
    const responses=await Promise.all([send(),send()]); assert.deepEqual(responses.map(r=>r.status).sort(),[200,400]);
    for(const response of responses) safe(await response.json());
  });
}
const server=app.listen(0,'127.0.0.1',async()=>{
  base=`http://127.0.0.1:${server.address().port}`;
  let cleanup='FAIL';
  try { await main(); } catch(error) { console.error(error.message); process.exitCode=1; }
  finally {
    try {
      for(const id of ids) await pool.execute('DELETE FROM knowledge_articles WHERE id = ?',[id]);
      const [after]=await pool.query('SELECT * FROM knowledge_articles ORDER BY id');
      assert.deepEqual(after,before); cleanup='PASS'; console.log('PASS cleanup: dữ liệu Knowledge Base trở về nguyên trạng');
    } catch(error) { console.error('Cleanup failed',error.code||error.name);process.exitCode=1; }
    fs.writeFileSync(path.resolve(__dirname,'../../docs/stage4-2-api-results.json'),JSON.stringify({testedAt:new Date().toISOString(),results,cleanup,temporaryArticles:ids.length},null,2)+'\n');
    server.close();await pool.end();
  }
});
