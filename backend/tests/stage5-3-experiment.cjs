const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const pool=require('../src/config/db');
const {runLogic}=require('./stage5-3-logic.cjs');
const {runExperiment,snapshot,counts}=require('../src/rag/retrievalExperiment');
const root=path.resolve(__dirname,'../..');
let report={metadata:{completed:false},validation:{status:'FAIL'},regression:{status:'NOT_RUN'}};
async function main() {
  assert.notEqual(process.env.NODE_ENV,'production');assert.ok(['127.0.0.1','localhost','::1'].includes(process.env.DB_HOST));
  const before=await snapshot(pool);assert.deepEqual(counts(before),{users:3,tickets:3,ticket_history:17,knowledge_articles:8},'Dữ liệu khác mốc demo: dừng, không tự xóa.');
  const logic=await runLogic();
  report=await runExperiment(pool);
  const tests=[];
  const check=(test,name,condition)=>{assert.ok(condition,name);tests.push({test,name,status:'PASS',mode:'model và MySQL thật'});};
  check(1,'Query thật có 384 chiều',report.questions.every(q=>q.queryValidation.dimension===384));
  check(2,'Query thật và cosine không NaN',report.questions.every(q=>q.queryValidation.finite&&q.topChunks.every(c=>!Number.isNaN(c.similarity))));
  check(3,'Query thật và cosine không Infinity',report.questions.every(q=>q.queryValidation.finite&&q.topChunks.every(c=>Number.isFinite(c.similarity))));
  tests.push(...logic);
  check(17,'Pipeline giữ nguyên mọi dữ liệu của 4 bảng',report.validation.dataPreserved);
  assert.equal(report.questionCount,24);assert.equal(report.articleCount,8);assert.equal(report.chunkCount,24);
  // Tự kiểm lại tử số/mẫu số từ danh sách nguồn, không chỉ tin cờ hit trong report.
  for(const [split,metric]of Object.entries(report.metrics))for(const level of ['chunkLevel','articleLevel']){
    const rows=report.questions.filter(q=>q.expected.length&&(split==='ALL'||q.split===split));
    for(const k of [1,3,5]){
      const hit=rows.filter(q=>(level==='chunkLevel'?q.topChunks:q.topArticles).slice(0,k).some(c=>q.expected.some(e=>e.articleId===c.articleId))).length;
      assert.deepEqual(metric.inKbWithExpected[level][k===1?'top1Accuracy':`hitRateAt${k}`],{hits:hit,total:rows.length,rate:hit/rows.length});
    }
  }
  report.validation.tests=tests;report.validation.status='PASS';
  // GĐ5.2 đã gọi Auth/RBAC/Ticket/KB sau kiểm tra embedding; tái sử dụng nguyên suite.
  const target=path.join(root,'docs/stage5-2-results.json');const backup=fs.readFileSync(target);
  try {
    execFileSync(process.execPath,[path.join(__dirname,'stage5-2-experiment.cjs')],{cwd:path.join(root,'backend'),stdio:'inherit',timeout:240000,windowsHide:true});
    const old=JSON.parse(fs.readFileSync(target,'utf8'));
    assert.ok(old.completed&&old.dataPreserved&&old.tests.every(t=>t.status==='PASS')&&old.logicTests.every(t=>t.status==='PASS'));
    report.regression={status:'PASS',stage52:{tests:old.tests,logicTests:old.logicTests,articleCount:old.articleCount,chunkCount:old.chunkCount,validation:old.validation},businessSuites:old.regression};
  } finally {fs.writeFileSync(target,backup);}
  const after=await snapshot(pool);assert.deepEqual(after,before);
  report.validation.afterRegression=counts(after);report.validation.dataPreservedAfterRegression=true;
  console.log('PASS GĐ5.3: test logic/integration và regression; dữ liệu trước/sau nguyên vẹn.');
}
main().catch(error=>{report.metadata.completed=false;report.validation.status='FAIL';console.error('GĐ5.3 thất bại:',error.code||error.name);process.exitCode=1;})
.finally(async()=>{fs.writeFileSync(path.join(root,'docs/stage5-3-results.json'),JSON.stringify(report,null,2)+'\n');await pool.end();});