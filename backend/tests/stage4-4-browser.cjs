const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execSync } = require('node:child_process');
const { chromium } = require(path.join(os.tmpdir(), 'it-support-browser-check/node_modules/playwright'));
const app = require('../src/app');
const pool = require('../src/config/db');
const root = path.resolve(__dirname, '../..');
const results = [], ids = [];
let before, browser, frontend, page, api, itArticle, adminArticle;
let runtimeErrors = [], employeeWrites = [];
async function snapshot() {
  const state = {};
  for(const table of ['users','tickets','ticket_history','knowledge_articles']) [state[table]] = await pool.query(`SELECT * FROM ${table} ORDER BY id`);
  return state;
}
async function test(number, name, action) {
  try { await action(); results.push({test:number,name,status:'PASS'});console.log(`PASS ${number}: ${name}`); }
  catch(error){results.push({test:number,name,status:'FAIL',error:error.name});throw new Error(`FAIL ${number}: ${name}`,{cause:error});}
}
const kb=()=>page.getByRole('region',{name:'Kho kiến thức',exact:true});
const detail=()=>page.getByRole('article',{name:'Chi tiết bài viết'});
const search=()=>page.getByPlaceholder('Tìm kiếm hướng dẫn...');
const list=()=>page.getByRole('list',{name:'Danh sách bài viết'});
async function login(role) {
  await page.goto('http://127.0.0.1:5173');
  await page.getByLabel('Email',{exact:true}).fill(`${role}@test.local`);
  await page.getByLabel('Mật khẩu',{exact:true}).fill(process.env.SEED_USER_PASSWORD);
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await page.getByRole('heading',{name:/^Xin chào,/}).waitFor();
}
async function logout() {await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();await page.getByRole('heading',{name:'Đăng nhập',exact:true}).waitFor();}
async function openKnowledge() {await page.getByRole('navigation',{name:'Chức năng'}).getByRole('button',{name:'Kho kiến thức',exact:true}).click();await list().waitFor();}
async function openArticle(article) {await list().getByRole('button',{name:`${article.code} — ${article.title}`,exact:true}).click();await detail().getByRole('heading',{name:article.title,exact:true}).waitFor();}
async function state(label) {await detail().locator('.kb-badge').filter({hasText:new RegExp(`^${label}$`)}).waitFor();}
async function createArticle(label) {
  await kb().getByRole('button',{name:'+ Tạo bài',exact:true}).click();
  await kb().getByLabel('Tiêu đề',{exact:true}).fill(label);
  await kb().getByLabel('Nội dung',{exact:true}).fill('Nội dung kiểm thử giao diện GĐ4.4.\nDòng thứ hai để kiểm tra xuống dòng.');
  const pending=page.waitForResponse(r=>r.url()===`${api}/knowledge`&&r.request().method()==='POST');
  await kb().getByRole('button',{name:'Lưu bài viết',exact:true}).click();
  const response=await pending;assert.equal(response.status(),201);
  const article=(await response.json()).article;ids.push(article.id);
  assert.deepEqual(Object.keys(response.request().postDataJSON()).sort(),['content','title']);
  await state('Bản nháp');await detail().getByRole('heading',{name:label,exact:true}).waitFor();return article;
}
async function editArticle(article,label) {
  await detail().getByRole('button',{name:'Sửa bài',exact:true}).click();
  await kb().getByLabel('Tiêu đề',{exact:true}).fill(label);
  await kb().getByLabel('Nội dung',{exact:true}).fill('Nội dung đã sửa qua giao diện.\nGiữ xuống dòng và không đổi mã.');
  const pending=page.waitForResponse(r=>r.url()===`${api}/knowledge/${article.id}`&&r.request().method()==='PUT');
  await kb().getByRole('button',{name:'Lưu bài viết',exact:true}).click();
  const response=await pending;assert.equal(response.status(),200);assert.deepEqual(Object.keys(response.request().postDataJSON()).sort(),['content','title']);
  const saved=(await response.json()).article;assert.equal(saved.code,article.code);assert.equal(saved.status,'DRAFT');
  await detail().getByRole('heading',{name:label,exact:true}).waitFor();return saved;
}
async function transition(article,button,status,label) {
  const pending=page.waitForResponse(r=>r.url()===`${api}/knowledge/${article.id}/status`&&r.request().method()==='PATCH');
  await detail().getByRole('button',{name:button,exact:true}).click();
  const response=await pending;assert.equal(response.status(),200);assert.deepEqual(response.request().postDataJSON(),{status});await state(label);
}
async function authorized(method,route,body) {
  const token=await page.evaluate(()=>sessionStorage.getItem('it_support_token'));
  return page.request.fetch(`${api}${route}`,{method,headers:{Authorization:`Bearer ${token}`},...(body?{data:body}:{})});
}
async function main() {
  assert.notEqual(process.env.NODE_ENV,'production');before=await snapshot();
  assert.deepEqual(Object.values(before).map(rows=>rows.length),[3,3,17,8],'Dữ liệu hiện tại khác dự kiến; dừng, không xóa dữ liệu.');
  assert.ok(before.knowledge_articles.every(a=>a.status==='PUBLISHED'));
  frontend=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173','--strictPort'],{cwd:path.join(root,'frontend'),env:{...process.env,VITE_API_URL:api},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let startup='';frontend.stdout.on('data',chunk=>startup+=chunk);frontend.stderr.on('data',chunk=>startup+=chunk);
  for(let i=0;i<100&&!startup.includes('http://127.0.0.1:5173');i++){if(frontend.exitCode!==null)throw new Error('Frontend startup failed');await new Promise(r=>setTimeout(r,100));}
  assert.ok(startup.includes('http://127.0.0.1:5173'));
  browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage();
  page.on('pageerror',error=>runtimeErrors.push(error.name));
  let trackEmployee=false;page.on('request',request=>{if(trackEmployee&&request.url().startsWith(`${api}/knowledge`)&&request.method()!=='GET')employeeWrites.push(request.method());});
  await test(1,'Login Employee',async()=>{await login('employee');trackEmployee=true;});
  await test(2,'Employee có mục Kho kiến thức',async()=>assert.equal(await page.getByRole('navigation').getByRole('button',{name:'Kho kiến thức',exact:true}).count(),1));
  await test(3,'Employee mở Kho kiến thức',openKnowledge);
  await test(4,'Hiển thị đúng 8 bài PUBLISHED từ API',async()=>{assert.equal(await list().locator('li').count(),8);assert.equal(await list().getByText('Đã xuất bản',{exact:true}).count(),8);});
  await test(5,'Employee không có Tạo bài',async()=>assert.equal(await kb().getByRole('button',{name:'+ Tạo bài',exact:true}).count(),0));
  const wifi=before.knowledge_articles.find(a=>a.title.includes('Wi-Fi'));
  await openArticle(wifi);
  await test(6,'Employee không có Sửa bài',async()=>assert.equal(await detail().getByRole('button',{name:'Sửa bài',exact:true}).count(),0));
  await test(7,'Employee không có nút đổi trạng thái',async()=>{for(const label of ['Xuất bản','Lưu trữ','Chuyển về bản nháp'])assert.equal(await detail().getByRole('button',{name:label,exact:true}).count(),0);});
  await detail().getByRole('button',{name:'Quay lại',exact:true}).click();
  await test(8,'Search Wi-Fi, không phân biệt hoa thường, trim',async()=>{await search().fill('  wI-fI  ');assert.equal(await list().locator('li').count(),1);assert.ok((await list().textContent()).includes(wifi.title));});
  await test(9,'Search không có kết quả',async()=>{await search().fill('khong-co-ket-qua-4-4');await kb().getByText('Không tìm thấy hướng dẫn phù hợp.',{exact:true}).waitFor();});
  await test(10,'Employee mở chi tiết',async()=>{await search().fill('');await openArticle(wifi);});
  await test(11,'Hiển thị đủ nội dung và giữ xuống dòng',async()=>{assert.equal(await detail().locator('.kb-content').textContent(),wifi.content);assert.equal(await detail().locator('.kb-content').evaluate(el=>getComputedStyle(el).whiteSpace),'pre-wrap');});
  await test(12,'Quay lại danh sách',async()=>{await detail().getByRole('button',{name:'Quay lại',exact:true}).click();assert.equal(await list().locator('li').count(),8);assert.deepEqual(employeeWrites,[]);});
  trackEmployee=false;await logout();
  await test(13,'Login IT',()=>login('it'));
  await test(14,'IT có mục Kho kiến thức',async()=>assert.equal(await page.getByRole('navigation').getByRole('button',{name:'Kho kiến thức',exact:true}).count(),1));
  await test(15,'IT thấy danh sách',async()=>{await openKnowledge();assert.equal(await list().locator('li').count(),8);});
  await test(16,'IT có nút Tạo bài',async()=>assert.equal(await kb().getByRole('button',{name:'+ Tạo bài',exact:true}).count(),1));
  await test(17,'IT tạo bài mới DRAFT',async()=>{itArticle=await createArticle('TEST GĐ4.4 IT tạo bài');});
  await test(18,'IT mở chi tiết bài vừa tạo',async()=>{await detail().getByRole('button',{name:'Quay lại',exact:true}).click();await openArticle(itArticle);});
  await test(19,'IT sửa title/content, giữ code/status',async()=>{itArticle=await editArticle(itArticle,'TEST GĐ4.4 IT đã sửa');});
  await test(20,'DRAFT -> PUBLISHED',()=>transition(itArticle,'Xuất bản','PUBLISHED','Đã xuất bản'));
  await test(21,'PUBLISHED -> ARCHIVED',()=>transition(itArticle,'Lưu trữ','ARCHIVED','Đã lưu trữ'));
  await test(22,'ARCHIVED -> DRAFT',()=>transition(itArticle,'Chuyển về bản nháp','DRAFT','Bản nháp'));
  await test(23,'IT tìm theo code',async()=>{await detail().getByRole('button',{name:'Quay lại',exact:true}).click();await search().fill(itArticle.code.toLowerCase());assert.equal(await list().locator('li').count(),1);});
  await logout();
  await test(24,'Login ADMIN',()=>login('admin'));
  await test(25,'ADMIN có mục Kho kiến thức',openKnowledge);
  await test(26,'ADMIN xem đủ ba trạng thái',async()=>{
    const response=await authorized('POST','/knowledge',{title:'TEST GĐ4.4 bài lưu trữ',content:'Bài tạm để kiểm tra hiển thị trạng thái.'});assert.equal(response.status(),201);
    const a=(await response.json()).article;ids.push(a.id);
    for(const status of ['PUBLISHED','ARCHIVED'])assert.equal((await authorized('PATCH',`/knowledge/${a.id}/status`,{status})).status(),200);
    const load=page.waitForResponse(r=>r.url()===`${api}/knowledge`&&r.request().method()==='GET');await kb().getByRole('button',{name:'Làm mới kho kiến thức'}).click();await load;
    await list().getByText('Đã lưu trữ',{exact:true}).waitFor();assert.equal(await list().getByText('Bản nháp',{exact:true}).count(),1);assert.equal(await list().getByText('Đã xuất bản',{exact:true}).count(),8);
  });
  await test(27,'ADMIN tạo/sửa bài',async()=>{adminArticle=await createArticle('TEST GĐ4.4 ADMIN tạo bài');adminArticle=await editArticle(adminArticle,'TEST GĐ4.4 ADMIN đã sửa');});
  await test(28,'ADMIN đổi trạng thái đủ workflow',async()=>{await transition(adminArticle,'Xuất bản','PUBLISHED','Đã xuất bản');await transition(adminArticle,'Lưu trữ','ARCHIVED','Đã lưu trữ');await transition(adminArticle,'Chuyển về bản nháp','DRAFT','Bản nháp');});
  await test(29,'API quản lý user ADMIN cũ hoạt động',async()=>{const response=await authorized('GET','/users');assert.equal(response.status(),200);assert.equal((await response.json()).users.length,3);});
  await test(30,'Tab Ticket và chi tiết cũ hoạt động',async()=>{await page.getByRole('navigation').getByRole('button',{name:'Ticket',exact:true}).click();await page.getByRole('button',{name:before.tickets[0].code,exact:true}).click();await page.getByRole('article',{name:'Chi tiết Ticket'}).waitFor();});
  await test(31,'Frontend build',async()=>execSync('npm.cmd run build',{cwd:path.join(root,'frontend'),stdio:'pipe',timeout:120000}));
  await test(32,'Không lỗi JavaScript nghiêm trọng',async()=>assert.deepEqual(runtimeErrors,[]));
  await test(33,'Frontend không hard-code tám bài',async()=>{const source=fs.readFileSync(path.join(root,'frontend/src/KnowledgeBase.jsx'),'utf8');for(const a of before.knowledge_articles){assert.ok(!source.includes(a.code));assert.ok(!source.includes(a.title));}assert.ok(source.includes("apiRequest('/knowledge'"));});
  await logout();await login('employee');trackEmployee=true;await openKnowledge();
  await test(34,'Employee không có chức năng quản trị, không thấy bài tạm chưa xuất bản',async()=>{assert.equal(await list().locator('li').count(),8);await openArticle(wifi);assert.equal(await detail().getByRole('button').count(),1);assert.deepEqual(employeeWrites,[]);});
  await test(35,'Reload giữ phiên đăng nhập',async()=>{await page.reload();await page.getByRole('heading',{name:/^Xin chào,/}).waitFor();await openKnowledge();assert.equal(await list().locator('li').count(),8);});
  await test('B1','Màn hình 390px không tràn ngang',async()=>{await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await openArticle(wifi);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await detail().getByRole('button',{name:'Quay lại',exact:true}).click();await page.setViewportSize({width:1280,height:900});});
  await test('B2','Loading, lỗi 500 thân thiện, thử lại và danh sách rỗng',async()=>{
    let release;const barrier=new Promise(resolve=>release=resolve);
    let finished; const continued=new Promise(resolve=>finished=resolve);
    const delayed=async route=>{try {await barrier;await route.continue();} catch(error) {runtimeErrors.push(error.name);} finally {finished();}};
    await page.route(`${api}/knowledge`,delayed);
    await kb().getByRole('button',{name:'Làm mới kho kiến thức'}).click();await kb().getByText('Đang tải...',{exact:true}).waitFor();release();await continued;await page.unroute(`${api}/knowledge`,delayed);await list().waitFor();
    const fail=route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'raw stack should not be displayed'})});
    await page.route(`${api}/knowledge`,fail);await kb().getByRole('button',{name:'Làm mới kho kiến thức'}).click();await kb().getByRole('alert').waitFor();assert.ok(!(await kb().textContent()).includes('raw stack'));
    await page.unroute(`${api}/knowledge`,fail);
    const empty=route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,articles:[]})});
    await page.route(`${api}/knowledge`,empty);await kb().getByRole('button',{name:'Làm mới kho kiến thức'}).click();await kb().getByText('Chưa có bài viết phù hợp.',{exact:true}).waitFor();await page.unroute(`${api}/knowledge`,empty);
    await kb().getByRole('button',{name:'Làm mới kho kiến thức'}).click();await list().waitFor();
  });
  await test('B3','403/404 hiển thị thông báo, không mở chi tiết',async()=>{
    for(const code of [403,404]){
      const fail=route=>route.fulfill({status:code,contentType:'application/json',body:JSON.stringify({success:false,message:code===403?'Bạn không có quyền xem bài viết.':'Không tìm thấy bài viết.'})});
      await page.route(`${api}/knowledge/${wifi.id}`,fail);await list().getByRole('button',{name:`${wifi.code} — ${wifi.title}`,exact:true}).click();await kb().getByRole('alert').waitFor();assert.equal(await detail().count(),0);await page.unroute(`${api}/knowledge/${wifi.id}`,fail);
    }
  });
  await kb().getByRole('button',{name:'Làm mới kho kiến thức'}).click();await list().waitFor();
  await page.screenshot({path:path.join(root,'docs/stage4-4-knowledge.png'),fullPage:true});
  await test('B4','401 xóa phiên và quay lại Login',async()=>{
    await page.route(`${api}/knowledge`,route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({success:false,message:'Phiên đăng nhập đã hết hạn.'})}));
    await kb().getByRole('button',{name:'Làm mới kho kiến thức'}).click();await page.getByRole('heading',{name:'Đăng nhập',exact:true}).waitFor();assert.equal(await page.evaluate(()=>sessionStorage.getItem('it_support_token')),null);
  });
  assert.deepEqual(runtimeErrors,[]);
}
const server=app.listen(0,'127.0.0.1',async()=>{
  api=`http://127.0.0.1:${server.address().port}/api`;let preserved=false;
  try{await main();}catch(error){console.error(error.message);if(error.cause)console.error(error.cause.message);process.exitCode=1;}
  finally{
    if(browser)await browser.close();
    if(frontend&&frontend.exitCode===null){const stopped=new Promise(resolve=>frontend.once('exit',resolve));frontend.kill();await stopped;}
    try{
      for(const id of ids)await pool.execute('DELETE FROM knowledge_articles WHERE id = ?',[id]);
      const after=await snapshot();assert.deepEqual(after,before);preserved=true;console.log('PASS: dữ liệu cũ và tám bài seed giữ nguyên.');
    }catch(error){console.error('Cleanup/preservation failed',error.code||error.name);process.exitCode=1;}
    fs.writeFileSync(path.join(root,'docs/stage4-4-browser-results.json'),JSON.stringify({testedAt:new Date().toISOString(),results,dataPreserved:preserved,temporaryArticles:ids.length},null,2)+'\n');
    server.close();await pool.end();
  }
});
