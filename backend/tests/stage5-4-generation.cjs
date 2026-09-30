const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const {performance}=require('node:perf_hooks');const {execFileSync}=require('node:child_process');
const pool=require('../src/config/db');const {runLogic}=require('./stage5-4-logic.cjs');const {runApi}=require('./stage5-4-api.cjs');
const {createRagService}=require('../src/rag/generationService');const {ensureNoSecrets}=require('../src/rag/generationSafety');const config=require('../src/rag/generationConfig');const {stats}=require('../src/rag/retrievalEvaluation');
const {snapshot,counts}=require('../src/rag/retrievalExperiment');const dataset=require('../src/rag/retrievalQuestions.json');const root=path.resolve(__dirname,'../..');
const report={timestamp:new Date().toISOString(),completed:false,model:config.MODEL,threshold:config.THRESHOLD,contextPolicy:'Top-3 article with individual score >= locked threshold; full article, max 12000 characters',questions:[],tests:[],regression:{status:'NOT_RUN'},manualEvaluation:{status:'PENDING'}};
const previousPath=path.join(root,'docs/stage5-4-results.json');
if(fs.existsSync(previousPath)) {
 const previous=JSON.parse(fs.readFileSync(previousPath,'utf8'));
 report.previousAttempts=[...(previous.previousAttempts||[]),{timestamp:previous.timestamp,completed:previous.completed,questions:previous.questions,error:previous.error||null,failedQuestionId:previous.completed?null:dataset.questions[previous.questions.length]?.id||null}];
}
let service;
async function main(){
 assert.notEqual(process.env.NODE_ENV,'production');assert.ok(['127.0.0.1','localhost','::1'].includes(process.env.DB_HOST));
 const before=await snapshot(pool);report.databaseBefore=counts(before);assert.deepEqual(report.databaseBefore,{users:3,tickets:3,ticket_history:17,knowledge_articles:8},'Database khác mốc; dừng không tự xóa.');
 report.tests.push(...await runLogic(),...await runApi());
 service=createRagService(pool);const init=performance.now();const prepared=await service.prepare();report.initializationMs=performance.now()-init;
 report.articleCount=prepared.corpus.articles.length;report.chunkCount=prepared.corpus.vectors.length;report.embedding=prepared.corpus.summary.embedding;
 const baseline=JSON.parse(fs.readFileSync(path.join(root,'docs/stage5-3-results.json'),'utf8'));
 for(const q of dataset.questions){
  console.log(`GĐ5.4 đang chạy ${q.id}`);
  let result;
  try { result=await service.ask(q.question); }
  catch(error) {
    if(error.experimentDiagnostic) {
      report.questions.push({...q,response:null,trace:error.experimentDiagnostic,error:{code:error.code},manualEvaluation:{status:'PENDING'}});
      continue; // Giữ lỗi generation như một kết quả, không đổi câu/nhãn hoặc retry để lấy câu đẹp.
    }
    throw error; // API/key/model/quota/network lỗi: dừng theo yêu cầu.
  }
  const old=baseline.questions.find(x=>x.id===q.id);
  assert.equal(result.trace.retrieval[0].code,old.topArticles[0].code);assert.ok(Math.abs(result.trace.retrieval[0].similarity-old.topArticles[0].similarity)<1e-6);
  assert.equal(result.trace.geminiCalled,old.accepted);
  if(q.group==='OUT_OF_KB'){assert.equal(result.response.answered,false);assert.equal(result.trace.geminiCalled,false);assert.deepEqual(result.response.sources,[]);}
  ensureNoSecrets(result);
  report.questions.push({...q,...result,manualEvaluation:{status:'PENDING'}});
 }
 report.metrics={questionCount:report.questions.length,geminiCalls:report.questions.filter(q=>q.trace.geminiCalled).length,answered:report.questions.filter(q=>q.response?.answered).length,fallback:report.questions.filter(q=>q.response&&!q.response.answered).length,thresholdFallback:report.questions.filter(q=>q.trace.reason==='BELOW_THRESHOLD').length,insufficientContextFallback:report.questions.filter(q=>q.trace.reason==='INSUFFICIENT_CONTEXT').length};
 report.metrics.generationErrors=report.questions.filter(q=>q.error).length;
 report.timing={unit:'ms',embeddingColdStartExcluded:true,perQuestion:Object.fromEntries(['queryEmbeddingMs','retrievalMs','contextMs','generationMs','totalMs'].map(key=>[key,stats(report.questions.map(q=>q.trace.timing[key]))])),generationCalledOnly:stats(report.questions.filter(q=>q.trace.geminiCalled).map(q=>q.trace.timing.generationMs))};
 assert.deepEqual(await snapshot(pool),before);report.dataPreservedAfterExperiment=true;
 const previousFile=path.join(root,'docs/stage5-3-results.json');const previous=fs.readFileSync(previousFile);
 try{execFileSync(process.execPath,[path.join(__dirname,'stage5-3-experiment.cjs')],{cwd:path.join(root,'backend'),stdio:'inherit',timeout:240000,windowsHide:true});const r=JSON.parse(fs.readFileSync(previousFile,'utf8'));assert.ok(r.metadata.completed&&r.validation.dataPreservedAfterRegression);report.regression={status:'PASS',stage53Tests:r.validation.tests,earlier:r.regression};}finally{fs.writeFileSync(previousFile,previous);}
 const after=await snapshot(pool);assert.deepEqual(after,before);report.databaseAfter=counts(after);report.allKnowledgePublished=after.knowledge_articles.every(a=>a.status==='PUBLISHED');report.dataPreserved=true;report.completed=true;
}
main().catch(error=>{report.completed=false;report.error={code:typeof error.code==='string'&&/^GEMINI_|^STALE_SOURCE$|^SENSITIVE_DATA$/.test(error.code)?error.code:'EXPERIMENT_FAILED'};console.error('GĐ5.4 dừng:',report.error.code);process.exitCode=1;})
.finally(async()=>{try{ensureNoSecrets(report);fs.writeFileSync(path.join(root,'docs/stage5-4-results.json'),JSON.stringify(report,null,2)+'\n');}finally{if(service)await service.dispose();await pool.end();}});
