const assert=require('node:assert/strict');
const express=require('express');
const {createRagRouter}=require('../src/routes/ragRoutes');
const {fallback}=require('../src/rag/generationOutput');
const {RagError,ensureNoSecrets}=require('../src/rag/generationSafety');
async function runApi(){
 const tests=[];const app=express();app.use(express.json());app.use('/api/auth',require('../src/routes/authRoutes'));
 let received,fail=false;app.use('/api/rag',createRagRouter(()=>({ask:async question=>{received=question;if(fail)throw new RagError('GEMINI_RATE_LIMIT',503,'Gemini hết hạn mức hoặc đang giới hạn lượt gọi.');return {response:fallback()};}})));
 app.use(require('../src/middleware/errorMiddleware'));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const ask=(body,token)=>fetch(base+'/api/rag/ask',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
 async function check(name,fn){await fn();tests.push({name,status:'PASS',type:'REAL_JWT_MYSQL_MOCK_GENERATION'});}
 try{
  await check('API thiếu JWT -> 401',async()=>assert.equal((await ask({question:'Hỏi'})).status,401));
  await check('API JWT sai -> 401',async()=>assert.equal((await ask({question:'Hỏi'},'invalid')).status,401));
  let adminToken;
  for(const role of ['employee','it','admin'])await check(`API cho phép ${role.toUpperCase()} đăng nhập thật`,async()=>{
    const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${role}@test.local`,password:process.env.SEED_USER_PASSWORD})});assert.equal(login.status,200);const {token}=await login.json();if(role==='admin')adminToken=token;
    const response=await ask({question:'  Câu hỏi  '},token);assert.equal(response.status,200);const body=await response.json();ensureNoSecrets(body);assert.deepEqual(body,fallback());assert.equal(received,'Câu hỏi');
  });
  await check('API validate question/body',async()=>{for(const body of [{},{question:''},{question:'  '},{question:1},{question:'x'.repeat(1001)},{question:'Hỏi',model:'unapproved'}])assert.equal((await ask(body,adminToken)).status,400);});
  await check('API provider failure trả lỗi kiểm soát, không giả câu trả lời',async()=>{fail=true;const response=await ask({question:'Hỏi'},adminToken);assert.equal(response.status,503);const body=await response.json();assert.equal(body.code,'GEMINI_RATE_LIMIT');assert.ok(!('answer'in body));ensureNoSecrets(body);});
 }finally{await new Promise(resolve=>server.close(resolve));}return tests;
}
module.exports={runApi};
if(require.main===module)runApi().then(t=>console.log(JSON.stringify(t,null,2))).catch(()=>{console.error('STAGE54_API_FAILED');process.exitCode=1;}).finally(()=>require('../src/config/db').end());
