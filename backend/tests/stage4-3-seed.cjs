const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync, execFileSync, spawnSync } = require('node:child_process');
const pool = require('../src/config/db');
const app = require('../src/app');
const data = require('../src/utils/knowledgeSeedData');
const users = require('../src/models/userModel');
const { seedKnowledge } = require('../src/utils/seedKnowledge');
const root = path.resolve(__dirname, '../..');
const results = [], backups = new Map(), regression = [];
let base, before, seeded, itUser, employee, it, admin, temporaryId;
let responses = 0;
const seedPath = path.join(root, 'backend/src/utils/seedKnowledge.js');
const seedSource = fs.readFileSync(seedPath, 'utf8');
async function snapshotOld() {
  const snapshot = {};
  for (const table of ['users', 'tickets', 'ticket_history']) {
    [snapshot[table]] = await pool.query(`SELECT * FROM ${table} ORDER BY id`);
  }
  return snapshot;
}
async function articles() { return (await pool.query('SELECT * FROM knowledge_articles ORDER BY id'))[0]; }
function safe(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) { assert.ok(!/password|hash|secret|stack|sql/i.test(key)); safe(child); }
}
async function request(route, expected, session, method = 'GET', body) {
  const response = await fetch(base + route, { method, headers: { ...(session ? { Authorization: `Bearer ${session.token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  assert.equal(response.status, expected, `${method} ${route}`); safe(value); responses++; return value;
}
async function check(number, name, work) {
  try { await work(); results.push({ test: number, name, status: 'PASS' }); console.log(`PASS ${number}: ${name}`); }
  catch (error) { results.push({ test: number, name, status: 'FAIL', error: error.name }); throw error; }
}
function runSeed() {
  // Chuỗi lệnh cố định, không chứa input người dùng hoặc secret.
  const output = execSync('npm.cmd run seed:knowledge', { cwd: path.join(root, 'backend'), encoding: 'utf8', timeout: 60000 });
  console.log(output.trim());
}
async function main() {
  assert.notEqual(process.env.NODE_ENV, 'production');
  const [[db]] = await pool.query('SELECT DATABASE() AS name'); assert.equal(db.name, 'it_support_rag');
  before = await snapshotOld();
  const [tablesBefore] = await pool.query('SHOW TABLES');
  itUser = before.users.find(user => user.email === 'it@test.local');
  assert.equal(itUser.role, 'IT'); assert.equal(itUser.status, 'ACTIVE');
  await check(1, 'npm run seed:knowledge chạy thành công', async () => { runSeed(); seeded = await articles(); });
  await check(2, 'Có đúng 8 chủ đề demo', async () => { assert.equal(seeded.length, 8); assert.deepEqual(seeded.map(a=>a.title).sort(), data.map(a=>a.title).sort()); });
  await check(3, 'Cả 8 bài PUBLISHED', async () => assert.ok(seeded.every(a=>a.status==='PUBLISHED')));
  await check(4, 'created_by là IT demo', async () => assert.ok(seeded.every(a=>a.created_by===itUser.id)));
  await check(5, 'Tìm IT theo email, không dùng ID cố định', async () => { assert.match(seedSource, /findByEmail\('it@test.local'\)/); assert.doesNotMatch(seedSource, /(?:created_by|user\.id)\s*[:=]\s*\d/); assert.ok(seeded.every(a=>a.created_by===itUser.id && a.updated_by===itUser.id)); });
  await check(6, 'Code đúng dạng và đúng ID tự tăng thực tế', async () => { for(const a of seeded) { assert.match(a.code,/^KB-\d{6,}$/); assert.equal(a.code,`KB-${String(a.id).padStart(6,'0')}`); } });
  await check(7, 'Code duy nhất', async () => assert.equal(new Set(seeded.map(a=>a.code)).size,8));
  await check(8, 'Title không rỗng', async () => assert.ok(seeded.every(a=>a.title.trim())));
  await check(9, 'Content không rỗng', async () => assert.ok(seeded.every(a=>a.content.trim())));
  await check(10, 'Nội dung 150–300 từ, đủ bốn phần, ghi rõ demo', async () => {
    for(const a of seeded) {
      const words=a.content.trim().split(/\s+/u).length; assert.ok(words>=150 && words<=300);
      for(const label of ['Hiện tượng','Nguyên nhân thường gặp','Các bước kiểm tra/xử lý cơ bản','Khi nào cần gửi Ticket cho IT','Dữ liệu demo']) assert.ok(a.content.includes(label));
      assert.ok(!/^test$/i.test(a.content.trim()));
    }
  });
  const login=email=>request('/api/auth/login',200,null,'POST',{email,password:process.env.SEED_USER_PASSWORD});
  employee=await login('employee@test.local'); it=await login('it@test.local'); admin=await login('admin@test.local');
  await check(11, 'EMPLOYEE thấy đủ 8 PUBLISHED', async () => { const r=await request('/api/knowledge',200,employee); assert.equal(r.articles.length,8); assert.ok(r.articles.every(a=>a.status==='PUBLISHED')); });
  await check(12, 'EMPLOYEE xem chi tiết cả 8 bài', async () => { for(const a of seeded) assert.equal((await request(`/api/knowledge/${a.id}`,200,employee)).article.code,a.code); });
  await check(13, 'IT thấy đủ bài', async () => assert.equal((await request('/api/knowledge',200,it)).articles.length,8));
  await check(14, 'ADMIN thấy đủ bài', async () => assert.equal((await request('/api/knowledge',200,admin)).articles.length,8));
  await check(15, 'EMPLOYEE không sửa bài', async () => { for(const a of seeded) await request(`/api/knowledge/${a.id}`,403,employee,'PUT',{title:'Không được sửa',content:'Không được sửa'}); });
  await check(16, 'EMPLOYEE không đổi trạng thái', async () => { for(const a of seeded) await request(`/api/knowledge/${a.id}/status`,403,employee,'PATCH',{status:'ARCHIVED'}); });
  await check(17, 'Chạy seed lần hai không duplicate', async () => { runSeed(); assert.equal((await articles()).length,8); });
  await check(18, 'Sau lần hai vẫn đúng 8 bài demo', async () => assert.deepEqual((await articles()).map(a=>a.title),seeded.map(a=>a.title)));
  await check(19, 'Lần hai giữ code và toàn bộ dữ liệu bài', async () => assert.deepEqual(await articles(),seeded));
  await check(20, 'Seed giữ nguyên users/Ticket/history', async () => assert.deepEqual(await snapshotOld(),before));
  await check(21, 'Response không có password/hash/secret', async () => assert.ok(responses>=20));
  await check(22, 'Không tạo bảng hoặc dữ liệu RAG', async () => { const [after]=await pool.query('SHOW TABLES'); assert.deepEqual(after,tablesBefore); assert.deepEqual(Object.values(after[0]).length,1); });
  await check(23, 'Script seed không có TRUNCATE/DROP/DELETE', async () => assert.doesNotMatch(seedSource,/\b(?:TRUNCATE|DROP|DELETE)\b/i));
  await check(24, 'API 4.2 và lọc trạng thái tiếp tục hoạt động', async () => {
    const created=await request('/api/knowledge',201,it,'POST',{title:'Bài tạm kiểm thử 4.3',content:'Nội dung tạm để kiểm tra quyền truy cập.'}); temporaryId=created.article.id;
    assert.equal((await request('/api/knowledge',200,employee)).articles.length,8);
    await request(`/api/knowledge/${temporaryId}`,403,employee);
    assert.equal((await request('/api/knowledge',200,it)).articles.length,9);
    assert.equal((await request('/api/knowledge',200,admin)).articles.length,9);
    await request(`/api/knowledge/${temporaryId}`,200,admin,'PUT',{title:'Bài tạm đã sửa',content:'Được cập nhật bởi Admin.'});
    for(const status of ['PUBLISHED','ARCHIVED','DRAFT']) {
      await request(`/api/knowledge/${temporaryId}/status`,200,it,'PATCH',{status});
      await request(`/api/knowledge/${temporaryId}`,status==='PUBLISHED'?200:403,employee);
    }
    await pool.execute('DELETE FROM knowledge_articles WHERE id = ?',[temporaryId]);temporaryId=null;
  });
  await check(25, 'Health và DB health hoạt động', async () => { await request('/api/health',200);await request('/api/health/db',200); });
  await check('B1','Production bị từ chối trước khi ghi dữ liệu',async()=>{
    const output=spawnSync(process.execPath,[seedPath],{cwd:path.join(root,'backend'),env:{...process.env,NODE_ENV:'production'},encoding:'utf8'});
    assert.equal(output.status,1);assert.ok(output.stderr.includes('production'));assert.deepEqual(await articles(),seeded);
  });
  await check('B2','Thiếu IT/sai role/INACTIVE bị từ chối',async()=>{
    const original=users.findByEmail;
    try { for(const fake of [undefined,{...itUser,role:'EMPLOYEE'},{...itUser,status:'INACTIVE'}]) { users.findByEmail=async email=>{assert.equal(email,'it@test.local');return fake;}; await assert.rejects(seedKnowledge(),/it@test.local/); } }
    finally {users.findByEmail=original;}
    assert.deepEqual(await articles(),seeded);
  });
  await check('B3','Giữ nguyên bài đã sửa tiêu đề/nội dung/trạng thái',async()=>{
    const a=seeded[0];
    try {
      await pool.execute('UPDATE knowledge_articles SET title = ?, content = ?, status = ? WHERE id = ?',['Tiêu đề demo đã biên tập',a.content+'\nNội dung bổ sung bởi người dùng.','ARCHIVED',a.id]);
      const changed=await articles();runSeed();assert.deepEqual(await articles(),changed);
      // Không có marker nhưng còn tiêu đề gốc cũng được nhận diện, không ghi đè.
      await pool.execute('UPDATE knowledge_articles SET title = ?, content = ? WHERE id = ?',[a.title,'Nội dung đã được người dùng viết lại.',a.id]);
      const edited=await articles();runSeed();assert.deepEqual(await articles(),edited);
    } finally {
      await pool.execute('UPDATE knowledge_articles SET title = ?, content = ?, status = ?, updated_by = ?, updated_at = ? WHERE id = ?',[a.title,a.content,a.status,a.updated_by,a.updated_at,a.id]);
    }
    assert.deepEqual(await articles(),seeded);
  });
  await check('B4','Mất cả title gốc và marker: dừng an toàn, không tạo trùng',async()=>{
    const a=seeded[0];
    try {
      await pool.execute('UPDATE knowledge_articles SET title = ?, content = ? WHERE id = ?',['Bài được người dùng đổi hoàn toàn','Nội dung đã thay đổi, không còn marker.',a.id]);
      const edited=await articles();
      await assert.rejects(seedKnowledge(),/chưa nhận diện/);
      assert.deepEqual(await articles(),edited);
    } finally {
      await pool.execute('UPDATE knowledge_articles SET title = ?, content = ?, updated_at = ? WHERE id = ?',[a.title,a.content,a.updated_at,a.id]);
    }
    assert.deepEqual(await articles(),seeded);
  });
  // Chạy nguyên suite cũ; giữ báo cáo cũ và lưu kết quả hồi quy riêng cho GĐ4.3.
  for(const [script,report] of [['stage4-2-api.cjs','stage4-2-api-results.json'],['stage4-2-regression.cjs','stage4-2-regression-results.json']]) {
    const reportPath=path.join(root,'docs',report);backups.set(reportPath,fs.readFileSync(reportPath));
    execFileSync(process.execPath,[path.join(__dirname,script)],{cwd:path.join(root,'backend'),stdio:'inherit',timeout:120000});
    const value=JSON.parse(fs.readFileSync(reportPath,'utf8'));
    if(value.results) {assert.ok(value.results.every(r=>r.status==='PASS'));assert.equal(value.cleanup,'PASS');}
    else {assert.equal(value.dataPreserved,true);assert.ok(value.suites.every(s=>s.results.every(r=>r.status==='PASS')));}
    regression.push({script,report:value});
  }
  assert.deepEqual(await snapshotOld(),before);assert.deepEqual(await articles(),seeded);
  console.log('PASS: regression và dữ liệu cuối cùng 3 users / 3 Ticket / 17 history / 8 PUBLISHED.');
}
const server=app.listen(0,'127.0.0.1',async()=>{
  base=`http://127.0.0.1:${server.address().port}`;
  let completed=false;
  try {await main();completed=true;} catch(error){console.error('FAIL',error.code||error.name,error.message);process.exitCode=1;}
  finally {
    try {
      if(temporaryId)await pool.execute('DELETE FROM knowledge_articles WHERE id = ?',[temporaryId]);
      for(const [file,content]of backups)fs.writeFileSync(file,content);
      const final=await articles();const counts={};
      for(const table of ['users','tickets','ticket_history','knowledge_articles']) {const [[row]]=await pool.query(`SELECT COUNT(*) AS n FROM ${table}`);counts[table]=row.n;}
      fs.writeFileSync(path.join(root,'docs/stage4-3-results.json'),JSON.stringify({testedAt:new Date().toISOString(),completed,results,regression,counts,articles:final.map(a=>({id:a.id,code:a.code,title:a.title,status:a.status,created_by:a.created_by,words:a.content.trim().split(/\s+/u).length}))},null,2)+'\n');
    }catch(error){console.error('Report/cleanup failed',error.code||error.name);process.exitCode=1;}
    server.close();await pool.end();
  }
});
