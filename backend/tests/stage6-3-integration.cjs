// GĐ6.3 integration: MySQL/API/browser thật, không Gemini thật; bảo toàn dữ liệu/báo cáo gốc.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn,execFileSync}=require('node:child_process');
const {randomUUID,createHash}=require('node:crypto');
const {runLogic,loadUserModel,replay}=require('./stage6-3-fixes.cjs');
const root=path.resolve(__dirname,'../..');
const pool=require('../src/config/db');
const {snapshot,counts}=require('../src/rag/retrievalExperiment');
const {ensureNoSecrets}=require('../src/rag/generationSafety');
const {normalizeOutput}=require('../src/rag/generationOutput');
const {buildPrompt}=require('../src/rag/generationPrompt');
const app=require('../src/app');
const cache=path.join(root,'backend/.cache');
fs.mkdirSync(cache,{recursive:true});
const output=path.join(cache,'stage6-3-integration.json');
const marker='[E2E-6.3 '+randomUUID().slice(0,8)+']';
const report={stage:'6.3',testedAt:new Date().toISOString(),completed:false,gemini_real_requests:0,tests:[],database:{},regression:{},cleanup:{status:'NOT RUN'},historyPreserved:false};
const fixtures={users:[],articles:[]},sessions={},artifacts=new Map();
let before,server,base,browser,frontend,step;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const readJson=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
async function check(name,action,mode='REAL_API_MYSQL'){
  step=name;const t={name,mode,status:'NOT RUN'};report.tests.push(t);
  try{const value=await action();t.status='PASS';if(value)t.observed=value;console.log('PASS '+name);}
  catch(e){t.status='FAIL';t.errorType=e.name;throw e;}
}
async function api(route,expected,session,method='GET',body){
  const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.equal(r.status,expected,'HTTP_STATUS');const data=await r.json();
  if(route!=='/auth/login')ensureNoSecrets(data);
  return data;
}
async function user(role){
  const email='stage63-'+randomUUID()+'@test.local';
  const data=await api('/users',201,sessions.ADMIN,'POST',{name:marker,email,role,password:process.env.SEED_USER_PASSWORD});
  fixtures.users.push({id:data.user.id,email});
  return api('/auth/login',200,null,'POST',{email,password:process.env.SEED_USER_PASSWORD});
}
async function restoreTempAdmin(id){
  await api('/users/'+id+'/role',200,sessions.ADMIN,'PATCH',{role:'ADMIN'});
  await api('/users/'+id+'/status',200,sessions.ADMIN,'PATCH',{status:'ACTIVE'});
}
async function cleanup(){
  const c=await pool.getConnection();
  try{
    await c.beginTransaction();
    for(const a of fixtures.articles){
      assert.ok(!before.knowledge_articles.some(x=>x.id===a.id));
      const [[row]]=await c.execute('SELECT id,code,created_by,content FROM knowledge_articles WHERE id=? FOR UPDATE',[a.id]);
      assert.ok(row&&row.code===a.code&&row.created_by===sessions.IT.user.id&&row.content===marker);
      await c.execute('DELETE FROM knowledge_articles WHERE id=? AND code=?',[a.id,a.code]);
    }
    for(const u of fixtures.users){
      assert.ok(!before.users.some(x=>x.id===u.id));
      const [[row]]=await c.execute('SELECT id,email,name FROM users WHERE id=? FOR UPDATE',[u.id]);
      assert.ok(row&&row.email===u.email&&row.name===marker);
      const [r]=await c.execute('DELETE FROM users WHERE id=? AND email=?',[u.id,u.email]);assert.equal(r.affectedRows,1);
    }
    await c.commit();fixtures.users=[];fixtures.articles=[];
    assert.deepEqual(await snapshot(pool),before);
    report.cleanup={status:'PASS',remainingTemporaryRows:0,fullOriginalRowsPreserved:true};
  }catch(e){await c.rollback();report.cleanup={status:'FAIL',remainingIds:{users:fixtures.users.map(x=>x.id),articles:fixtures.articles.map(x=>x.id)}};throw e;}
  finally{c.release();}
}
async function adminTests(){
  await check('ADMIN cuối: self-demote và INACTIVE đều 409, DB không đổi',async()=>{
    assert.equal(before.users.filter(u=>u.role==='ADMIN'&&u.status==='ACTIVE').length,1);
    const id=sessions.ADMIN.user.id;
    for(const [field,value]of [['role','EMPLOYEE'],['role','IT'],['status','INACTIVE']]){
      const r=await api('/users/'+id+'/'+field,409,sessions.ADMIN,'PATCH',{[field]:value});
      assert.ok(r.message.includes('ADMIN'));assert.deepEqual(await snapshot(pool),before);
    }
  });
  await check('EMPLOYEE/IT không quản lý user; thiếu JWT 401',async()=>{
    for(const role of ['EMPLOYEE','IT'])for(const [field,value]of [['role','IT'],['status','INACTIVE']])
      await api('/users/'+sessions.ADMIN.user.id+'/'+field,403,sessions[role],'PATCH',{[field]:value});
    await api('/users/'+sessions.ADMIN.user.id+'/role',401,null,'PATCH',{role:'IT'});
  });
  const a=await user('ADMIN'),b=await user('ADMIN');
  report.temporaryUsers=fixtures.users.map(x=>({id:x.id}));
  await check('Có ADMIN khác: self-target hạ role, token cũ mất quyền',async()=>{
    await api('/users/'+a.user.id+'/role',200,a,'PATCH',{role:'IT'});
    await api('/users',403,a);await restoreTempAdmin(a.user.id);
  });
  await check('Có ADMIN khác: self-target INACTIVE chặn token',async()=>{
    await api('/users/'+a.user.id+'/status',200,a,'PATCH',{status:'INACTIVE'});
    await api('/users',401,a);await restoreTempAdmin(a.user.id);
  });
  await check('ADMIN other-target role/status trên user tạm',async()=>{
    await api('/users/'+b.user.id+'/role',200,a,'PATCH',{role:'EMPLOYEE'});
    await api('/users/'+b.user.id+'/status',200,a,'PATCH',{status:'INACTIVE'});
    await restoreTempAdmin(b.user.id);
  });
  // Cô lập tập ADMIN được xét vào hai fixture; khóa/UPDATE/commit là MySQL thật.
  // Không vô hiệu hóa ADMIN gốc để tạo điều kiện "hai ADMIN cuối" nguy hiểm.
  const ids=[a.user.id,b.user.id];
  function fixturePool(failAfterUpdate=false){
    return {async getConnection(){
      const c=await pool.getConnection();
      return {beginTransaction:()=>c.beginTransaction(),commit:()=>c.commit(),rollback:()=>c.rollback(),release:()=>c.release(),
        async execute(sql,args){
          if(sql==='SELECT id, name, email, role, status FROM users ORDER BY id FOR UPDATE')
            return c.execute('SELECT id, name, email, role, status FROM users WHERE id IN (?,?) ORDER BY id FOR UPDATE',ids);
          const r=await c.execute(sql,args);if(failAfterUpdate&&/^UPDATE/.test(sql))throw new Error('INJECTED_ROLLBACK');return r;
        }};
    }};
  }
  for(const pair of [['updateRole','updateRole'],['updateStatus','updateStatus'],['updateRole','updateStatus']])
    await check('Race '+pair.join('/')+' trên hai ADMIN tạm',async()=>{
      await restoreTempAdmin(ids[0]);await restoreTempAdmin(ids[1]);
      const m=loadUserModel(fixturePool());
      const outcomes=await Promise.allSettled(pair.map((method,i)=>m[method](ids[i],method==='updateRole'?'IT':'INACTIVE')));
      assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
      assert.equal(outcomes.find(x=>x.status==='rejected').reason.code,'LAST_ACTIVE_ADMIN');
      const [rows]=await pool.execute('SELECT role,status FROM users WHERE id IN (?,?)',ids);
      assert.equal(rows.filter(x=>x.role==='ADMIN'&&x.status==='ACTIVE').length,1);
      return {success:1,conflict409:1,remainingFixtureAdmins:1,originalAdminUntouched:true};
    },'MODEL_REAL_MYSQL_SCOPED_TEMP_USERS');
  await check('Rollback lỗi sau UPDATE không để lại thay đổi',async()=>{
    await restoreTempAdmin(ids[0]);await restoreTempAdmin(ids[1]);
    const saved=await snapshot(pool);await assert.rejects(loadUserModel(fixturePool(true)).updateRole(ids[0],'IT'));
    assert.deepEqual(await snapshot(pool),saved);
  },'MODEL_REAL_MYSQL_SCOPED_TEMP_USERS');
  await check('HTTP ID không tồn tại và validation vẫn đúng',async()=>{
    await api('/users/2147483647/role',404,sessions.ADMIN,'PATCH',{role:'IT'});
    await api('/users/'+a.user.id+'/role',400,sessions.ADMIN,'PATCH',{role:'OWNER'});
  });
}
async function startBrowser(){
  const {chromium}=require(path.join(os.tmpdir(),'it-support-browser-check/node_modules/playwright'));
  frontend=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173','--strictPort'],{
    cwd:path.join(root,'frontend'),env:{...process.env,VITE_API_URL:base},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let startup='';frontend.stdout.on('data',x=>startup+=x);frontend.stderr.on('data',x=>startup+=x);
  for(let i=0;i<150&&!startup.includes('http://127.0.0.1:5173');i++){assert.equal(frontend.exitCode,null);await new Promise(r=>setTimeout(r,100));}
  assert.ok(startup.includes('http://127.0.0.1:5173'));
  browser=await chromium.launch({channel:'msedge',headless:true});report.browser=browser.version();
  const page=await browser.newPage();page.setDefaultTimeout(12000);
  await page.goto('http://127.0.0.1:5173');
  await page.getByLabel('Email',{exact:true}).fill('it@test.local');
  await page.getByLabel('Mật khẩu',{exact:true}).fill(process.env.SEED_USER_PASSWORD);
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await page.getByRole('button',{name:'Kho kiến thức',exact:true}).click();
  return page;
}
async function stopBrowser(){
  if(browser){await browser.close();browser=null;}
  if(frontend&&frontend.exitCode===null&&frontend.signalCode===null){
    const done=new Promise(r=>frontend.once('exit',r));frontend.kill();await done;
  }frontend=null;
}
async function unicodeTests(){
  const page=await startBrowser();
  let writes=0;page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/knowledge')writes++;});
  for(const [label,unit]of [['ASCII','a'],['Tiếng Việt','ế'],['Emoji','😀'],['Surrogate pair','𝄞']]){
    await check('Unicode '+label+' boundary 255: UI và API chấp nhận',async()=>{
      await page.getByRole('button',{name:'+ Tạo bài',exact:true}).click();
      const title=unit.repeat(255);
      await page.locator('#kb-title').click();await page.keyboard.insertText(title);
      assert.equal(await page.locator('#kb-title').inputValue(),title);
      await page.locator('#kb-content').fill(marker);
      const pending=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/knowledge');
      await page.getByRole('button',{name:'Lưu bài viết',exact:true}).click();
      const r=await pending;assert.equal(r.status(),201);const a=(await r.json()).article;
      fixtures.articles.push({id:a.id,code:a.code});assert.equal(a.title,title);
      await page.getByRole('button',{name:'Quay lại',exact:true}).click();
      return {codePoints:255,utf16:title.length,code:a.code};
    },'BROWSER_API_MYSQL');
    await check('Unicode '+label+' 256: UI chặn gửi và API trả 400',async()=>{
      await page.getByRole('button',{name:'+ Tạo bài',exact:true}).click();
      const title=unit.repeat(256);
      await page.locator('#kb-title').fill(title);await page.locator('#kb-content').fill(marker);
      const n=writes;await page.getByRole('button',{name:'Lưu bài viết',exact:true}).click();
      await page.getByRole('alert').filter({hasText:'255'}).waitFor();assert.equal(writes,n);
      await api('/knowledge',400,sessions.IT,'POST',{title,content:marker});
      await page.getByRole('button',{name:'Hủy',exact:true}).click();
    },'BROWSER_API_MYSQL');
  }
  await check('Unicode combining marks: đếm code point, không phải grapheme',async()=>{
    await page.getByRole('button',{name:'+ Tạo bài',exact:true}).click();
    const title='a\u0301'.repeat(128);assert.equal([...title].length,256);
    await page.locator('#kb-title').fill(title);await page.locator('#kb-content').fill(marker);
    await page.getByRole('button',{name:'Lưu bài viết',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'255'}).waitFor();
    await api('/knowledge',400,sessions.IT,'POST',{title,content:marker});
    await page.getByRole('button',{name:'Hủy',exact:true}).click();
  },'BROWSER_API_MYSQL');
  await check('Unicode edit và trim cùng quy tắc backend',async()=>{
    const a=fixtures.articles[0];await page.getByRole('button').filter({hasText:a.code}).click();
    await page.getByRole('button',{name:'Sửa bài',exact:true}).click();
    const title='  '+'😀'.repeat(255)+'  ';
    await page.locator('#kb-title').fill(title);
    const pending=page.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname==='/api/knowledge/'+a.id);
    await page.getByRole('button',{name:'Lưu bài viết',exact:true}).click();
    const response=await pending;assert.equal(response.status(),200);assert.equal((await response.json()).article.title,title.trim());
  },'BROWSER_API_MYSQL');
  report.temporaryArticles=fixtures.articles;
  await stopBrowser();
}
async function ragReplayApi(){
  const express=require('express'),{createRagRouter}=require('../src/routes/ragRoutes');
  const qs=readJson('docs/stage5-4-results.json').questions;
  let current;
  const mockApp=express();mockApp.use(express.json());mockApp.use('/api/rag',createRagRouter(()=>({
    async ask(question){
      assert.equal(question,current.question);const prompt=buildPrompt(question,current.trace.context);
      assert.equal(JSON.parse(prompt.contents[0].parts[0].text).QUESTION,question);
      const r=normalizeOutput(replay(current),current.trace.context);return {response:r.response};
    }
  })));
  const srv=mockApp.listen(0,'127.0.0.1');await new Promise(r=>srv.once('listening',r));
  try{
    for(const id of ['B01','C03','A03','C01'])await check('POST /rag/ask replay '+id,async()=>{
      current=qs.find(q=>q.id===id);
      const r=await fetch('http://127.0.0.1:'+srv.address().port+'/api/rag/ask',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+sessions.EMPLOYEE.token},body:JSON.stringify({question:current.question})});
      assert.equal(r.status,200);const data=await r.json();ensureNoSecrets(data);
      assert.equal(data.answered,true);assert.ok(data.sources.length);
      assert.ok(!('trace'in data)&&!('evidence'in data));
      return {http:200,sourceCodes:data.sources.map(s=>s.code),qualityImprovementProven:false};
    },'REAL_AUTH_API_HISTORICAL_CONTEXT_MOCK_GENERATION');
  }finally{await new Promise(r=>{srv.close(r);srv.closeAllConnections();});}
}
async function regression(){
  const original=fs.readFileSync(path.join(root,'backend/tests/stage6-2-e2e.cjs'),'utf8');
  // Không chạy assertion tái hiện BUG CŨ sau fix; 10 flow, responsive, regression giữ nguyên.
  assert.equal(original.split('await reviewP2();').length,2);
  let adapted=original.replace('await reviewP2();',"report.previous_p2_review = {mode:'NOT_RUN_HISTORICAL_BUG_ASSERTIONS',replacement:'stage6-3 dedicated tests'};");
  adapted=adapted.replaceAll('docs/stage6-2-results.json','backend/.cache/stage6-3-e2e.json')
    .replaceAll('docs/evidence/stage6-2','backend/.cache/stage6-3-e2e-evidence');
  const guard="assert.equal(git(['diff', '--name-only', 'HEAD', '--', 'backend/src', 'frontend/src', 'database', 'README.md']), '');";
  assert.ok(adapted.includes(guard));
  adapted=adapted.replace(guard,"// Source so với snapshot đầu lượt được kiểm trong finally; GĐ6.3 có thay đổi có chủ đích.");
  report.e2eAdaptation={source:'backend/tests/stage6-2-e2e.cjs',sourceSha256:sha(original),executedSha256:sha(adapted),changes:['Bỏ riêng reviewP2 xác nhận bug lịch sử; thay bằng test GĐ6.3','JSON/ảnh ghi cache GĐ6.3','So source với snapshot đầu lượt thay vì HEAD chưa sửa'],businessFlowsChanged:false};
  const launch="const Module=require('module'),path=require('path');const filename=path.resolve('tests/stage6-2-e2e.cjs');const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile("+JSON.stringify(adapted)+",filename);";
  // Dùng stdin tránh giới hạn độ dài command Windows, không tạo runner trùng trên đĩa.
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[],{cwd:path.join(root,'backend'),env:{...process.env,GEMINI_API_KEY:'stage63-mock-provider-only',GEMINI_MODEL:require('../src/rag/generationConfig').MODEL},stdio:['pipe','pipe','pipe'],windowsHide:true});
    let timer=setTimeout(()=>{child.kill();reject(new Error('REGRESSION_TIMEOUT'));},300000);
    child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
    child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);if(code===0)resolve();else reject(new Error('REGRESSION_FAILED'));});
    child.stdin.end(launch);
  });
  const e=readJson('backend/.cache/stage6-3-e2e.json');
  report.e2e={completed:e.completed,flows:e.e2e,summary:e.e2eSummary,responsive:e.responsive,cleanup:e.cleanup,gemini_real_requests:e.gemini_real_requests};
  report.regression=e.regression;report.frontend_build=e.frontend_build;
  assert.equal(e.completed,true);assert.equal(e.e2eSummary.PASS,10);assert.equal(e.frontend_build.status,'PASS');
  assert.equal(e.gemini_real_requests,0);assert.ok(e.responsive.checks.every(t=>t.status==='PASS'));
  assert.ok(e.regression.suites.flatMap(s=>s.tests).every(t=>t.status==='PASS'));
  console.log('Regression/E2E/build PASS');
}
async function main(){
  assert.notEqual(process.env.NODE_ENV,'production');assert.ok(['127.0.0.1','localhost','::1'].includes(process.env.DB_HOST));
  const [[db]]=await pool.query('SELECT DATABASE() AS name');assert.equal(db.name,'it_support_rag');
  before=await snapshot(pool);assert.deepEqual(counts(before),{users:3,tickets:3,ticket_history:17,knowledge_articles:8});
  report.database.before={counts:counts(before),published:before.knowledge_articles.filter(x=>x.status==='PUBLISHED').length,fingerprint:sha(JSON.stringify(before))};
  assert.equal(report.database.before.published,8);
  const files=execFileSync('git',['ls-files','docs','database'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/);
  for(const f of files)artifacts.set(f,fs.readFileSync(path.join(root,f)));
  const logic=await runLogic();assert.ok(logic.every(t=>t.status==='PASS'));report.logic=logic;
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port+'/api';
  for(const role of ['EMPLOYEE','IT','ADMIN']){
    sessions[role]=await api('/auth/login',200,null,'POST',{email:role.toLowerCase()+'@test.local',password:process.env.SEED_USER_PASSWORD});
    assert.equal(sessions[role].user.role,role);
  }
  await adminTests();await unicodeTests();await ragReplayApi();await cleanup();
  await regression();const after=await snapshot(pool);assert.deepEqual(after,before);
  report.database.after={counts:counts(after),published:after.knowledge_articles.filter(x=>x.status==='PUBLISHED').length,fingerprint:sha(JSON.stringify(after)),fullOriginalRowsPreserved:true};
  report.completed=true;
}
main().catch(e=>{report.error={type:e.name,step:step||'setup'};process.exitCode=1;console.error('STAGE63_INTEGRATION_FAILED '+e.name+' STEP '+(step||'setup'));}).finally(async()=>{
  try{
    await stopBrowser();if(fixtures.users.length||fixtures.articles.length)await cleanup();
    report.historyPreserved=[...artifacts].every(([f,b])=>fs.readFileSync(path.join(root,f)).equals(b));
    if(!report.historyPreserved){report.completed=false;process.exitCode=1;}
    if(before)assert.deepEqual(await snapshot(pool),before);
  }catch(e){report.completed=false;process.exitCode=1;report.cleanup.status='FAIL';}
  if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});
  await pool.end();report.finishedAt=new Date().toISOString();
  ensureNoSecrets(report);fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({completed:report.completed,passed:report.tests.filter(t=>t.status==='PASS').length,failed:report.tests.filter(t=>t.status==='FAIL').length,cleanup:report.cleanup,historyPreserved:report.historyPreserved}));
});
